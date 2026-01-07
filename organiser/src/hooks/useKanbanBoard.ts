import * as React from "react";
import { App, TFile, moment } from "obsidian";
import { BaseKanbanItem, BoardConfig } from "../types/kanban-config";
import {
	BoardEntry,
	KanbanBoardData,
	buildBoardEntries,
	buildBoardsFromEntries,
	resolveBoardEntryForFile,
} from "../kanban/buildBoardsData";
import { resolveKanbanConstructor } from "../kanban/resolveKanbanConstructor";
import { ColumnLookup } from "../utils/field-manager";

const momentFn = moment as any;

interface UseKanbanBoardOptions<T extends BaseKanbanItem> {
	app: App;
	boardId: string;
	config: BoardConfig<T>;
	renderItem: (item: T) => string;
	itemClassName?: string;
	runtimeFilter?: (
		item: T,
		frontmatter: Record<string, unknown>
	) => boolean;
	runtimeSort?: (a: T, b: T) => number;
	groupBy?: (
		item: T,
		frontmatter: Record<string, unknown>
	) => string | undefined;
	groupLabel?: (groupId: string) => string;
	groupOrder?: (a: string, b: string) => number;
	refreshDelayMs?: number;
	clickBlockMs?: number;
	internalUpdateDelayMs?: number;
	logPrefix?: string;
	logItemErrors?: boolean;
	onDropItem?: (itemId: string, targetColumnId: string) => Promise<void> | void;
	onCardClick?: (
		event: MouseEvent,
		itemId: string,
		itemEl: HTMLElement
	) => void;
}

interface UseKanbanBoardResult {
	containerRef: React.RefObject<HTMLDivElement>;
	rebuild: () => void;
}

export const useKanbanBoard = <T extends BaseKanbanItem>(
	options: UseKanbanBoardOptions<T>
): UseKanbanBoardResult => {
	const {
		app,
		boardId,
		config,
		renderItem,
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
		onDropItem,
		onCardClick,
		refreshDelayMs = 50,
		clickBlockMs = 250,
		internalUpdateDelayMs = 250,
		logPrefix = "KanbanBoard",
		logItemErrors = false,
	} = options;

	const containerRef = React.useRef<HTMLDivElement>(null);
	const kanbanInstanceRef = React.useRef<any>(null);
	const lastDragTimeRef = React.useRef(0);
	const isDragInProgressRef = React.useRef(false);
	const lastForceSplitRef = React.useRef<{
		itemId: string;
		at: number;
	} | null>(null);
	const lastInternalUpdateRef = React.useRef(0);
	const refreshTimerRef = React.useRef<number | null>(null);
	const entriesByColumnRef = React.useRef<Map<string, BoardEntry<T>[]>>(
		new Map()
	);
	const entriesByFileRef = React.useRef<Map<string, BoardEntry<T>>>(
		new Map()
	);
	const columnLookupRef = React.useRef<ColumnLookup | null>(null);
	const pendingRefreshRef = React.useRef<{
		all: boolean;
		columns: Set<string>;
	}>({
		all: false,
		columns: new Set(),
	});
	const configRef = React.useRef(config);
	const optionsRef = React.useRef({
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
		renderItem,
	});

	configRef.current = config;
	optionsRef.current = {
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
		renderItem,
	};

	const buildBoardsFromCache = React.useCallback(
		(columnIds?: Iterable<string>) => {
			const currentConfig = configRef.current;
			const currentOptions = optionsRef.current;
			const entriesByColumn = entriesByColumnRef.current;
			const columnIdSet = columnIds ? new Set(columnIds) : null;
			const columns = columnIdSet
				? currentConfig.columns.filter((column) =>
						columnIdSet.has(column.id)
					)
				: currentConfig.columns;

			for (const column of columns) {
				if (!entriesByColumn.has(column.id)) {
					entriesByColumn.set(column.id, []);
				}
			}

			return buildBoardsFromEntries(
				columns,
				entriesByColumn,
				currentOptions.renderItem,
				{
					itemClassName: currentOptions.itemClassName,
					runtimeFilter: currentOptions.runtimeFilter,
					runtimeSort: currentOptions.runtimeSort,
					groupBy: currentOptions.groupBy,
					groupLabel: currentOptions.groupLabel,
					groupOrder: currentOptions.groupOrder,
				}
			);
		},
		[]
	);

	const initKanban = React.useCallback(
		(initialBoards: KanbanBoardData[] = []) => {
			if (!containerRef.current) return;

			containerRef.current.innerHTML = "";

			try {
				const KanbanCtor = resolveKanbanConstructor();
				const kanban = new KanbanCtor({
					element: `#${boardId}`,
					gutter: "0px",
					widthBoard: "100%",
					dragBoards: false,
					boards: initialBoards,
					dragEl: (el: HTMLElement) => {
						if (el.classList.contains("kanban-group-header")) return;
						isDragInProgressRef.current = true;
						el.classList.add("is-dragging");
						console.log(
							`[${logPrefix}] drag start`,
							el.dataset.eid ?? "unknown"
						);
					},
					dragendEl: (el: HTMLElement) => {
						if (el.classList.contains("kanban-group-header")) return;
						el.classList.remove("is-dragging");
						isDragInProgressRef.current = false;
						lastDragTimeRef.current = Date.now();
						console.log(
							`[${logPrefix}] drag end`,
							el.dataset.eid ?? "unknown"
						);
					},
					dropEl: (
						el: HTMLElement,
						target: HTMLElement,
						_source: HTMLElement,
						_sibling: HTMLElement
					) => {
						if (el.classList.contains("kanban-group-header")) return;
						if (!onDropItem) return;

						const itemId = el.dataset.eid;
						const targetBoardEl = target.closest(
							".kanban-board"
						) as HTMLElement | null;
						const targetBoardId = targetBoardEl?.dataset.id;

						if (itemId && targetBoardId) {
							lastDragTimeRef.current = Date.now();
							lastInternalUpdateRef.current = Date.now();
							Promise.resolve(onDropItem(itemId, targetBoardId)).catch(
								(err) => {
									console.error(
										`[${logPrefix}] Failed to update frontmatter`,
										err
									);
								}
							);
						}
					},
				});

				kanbanInstanceRef.current = kanban;

				// Mark today's column
				const today = momentFn().format("YYYY-MM-DD");
				const todayBoard = containerRef.current?.querySelector(
					`.kanban-board[data-id="${today}"]`
				);
				if (todayBoard) {
					todayBoard.classList.add("is-today");
				}
			} catch (err) {
				console.error(
					`[${logPrefix}] Error initializing jKanban`,
					err
				);
			}
		},
		[boardId, logPrefix, onDropItem]
	);

	const rebuild = React.useCallback(() => {
		if (refreshTimerRef.current !== null) {
			window.clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}

		const currentConfig = configRef.current;
		const currentOptions = optionsRef.current;
		const { entriesByColumn, entriesByFile, columnLookup } =
			buildBoardEntries(app, currentConfig, {
				logPrefix,
				logItemErrors,
			});

		entriesByColumnRef.current = entriesByColumn;
		entriesByFileRef.current = entriesByFile;
		columnLookupRef.current = columnLookup;

		const boards = buildBoardsFromEntries(
			currentConfig.columns,
			entriesByColumn,
			currentOptions.renderItem,
			{
				itemClassName: currentOptions.itemClassName,
				runtimeFilter: currentOptions.runtimeFilter,
				runtimeSort: currentOptions.runtimeSort,
				groupBy: currentOptions.groupBy,
				groupLabel: currentOptions.groupLabel,
				groupOrder: currentOptions.groupOrder,
			}
		);
		initKanban(boards);
	}, [app, initKanban, logItemErrors, logPrefix]);

	const syncBoardItems = React.useCallback(
		(board: KanbanBoardData): boolean => {
			const kanban = kanbanInstanceRef.current;
			if (!kanban) return false;

			let boardEl = kanban.findBoard(board.id) as HTMLElement | null;
			if (!boardEl) {
				try {
					kanban.addBoards([
						{ id: board.id, title: board.title, item: [] },
					]);
					boardEl = kanban.findBoard(board.id) as HTMLElement | null;
				} catch (err) {
					console.error(
						`[${logPrefix}] Failed to add board ${board.id}`,
						err
					);
					return false;
				}
			}
			if (!boardEl) return false;

			const titleEl = boardEl.querySelector(".kanban-title-board");
			if (titleEl && titleEl.textContent !== board.title) {
				titleEl.textContent = board.title;
			}

			const existingEls = kanban.getBoardElements(
				board.id
			) as HTMLElement[];
			const existingById = new Map<string, HTMLElement>();
			for (const el of existingEls) {
				const id = el.dataset.eid;
				if (id) existingById.set(id, el);
			}

			const nextIds = new Set<string>();
			for (const item of board.item) {
				nextIds.add(item.id);
			}

			for (const [id] of existingById) {
				if (!nextIds.has(id)) {
					kanban.removeElement(id);
				}
			}

			for (const item of board.item) {
				let el = existingById.get(item.id);
				if (!el) {
					kanban.addElement(board.id, item);
					el = kanban.findElement(item.id) as HTMLElement | null;
				}
				if (el && el.innerHTML !== item.title) {
					el.innerHTML = item.title;
				}
			}

			const dragEl = boardEl.querySelector(
				".kanban-drag"
			) as HTMLElement | null;
			if (dragEl) {
				for (const item of board.item) {
					const el = kanban.findElement(
						item.id
					) as HTMLElement | null;
					if (el) {
						dragEl.appendChild(el);
					}
				}
			}

			const boards = kanban.options?.boards;
			if (boards) {
				const idx = boards.findIndex(
					(existing: KanbanBoardData) => existing.id === board.id
				);
				if (idx >= 0) {
					boards[idx] = {
						...boards[idx],
						title: board.title,
						item: board.item,
					};
				}
			}

			return true;
		},
		[logPrefix]
	);

	const refreshBoard = React.useCallback(
		(columnIds?: Iterable<string>) => {
			if (!kanbanInstanceRef.current) {
				rebuild();
				return;
			}
			if (
				Date.now() - lastInternalUpdateRef.current <
				internalUpdateDelayMs
			) {
				return;
			}

			const boards = buildBoardsFromCache(columnIds);
			for (const board of boards) {
				syncBoardItems(board);
			}
		},
		[
			buildBoardsFromCache,
			internalUpdateDelayMs,
			rebuild,
			syncBoardItems,
		]
	);

	const scheduleRefresh = React.useCallback(
		(columnIds?: Iterable<string> | null, forceAll = false) => {
			if (forceAll) {
				pendingRefreshRef.current.all = true;
				pendingRefreshRef.current.columns.clear();
			}
			if (columnIds) {
				for (const columnId of columnIds) {
					pendingRefreshRef.current.columns.add(columnId);
				}
			}

			if (refreshTimerRef.current !== null) {
				window.clearTimeout(refreshTimerRef.current);
			}
			refreshTimerRef.current = window.setTimeout(() => {
				refreshTimerRef.current = null;
				const pending = pendingRefreshRef.current;
				if (!pending.all && pending.columns.size === 0) {
					return;
				}
				const columns = pending.all ? undefined : pending.columns;
				pendingRefreshRef.current = {
					all: false,
					columns: new Set(),
				};
				refreshBoard(columns);
			}, refreshDelayMs);
		},
		[refreshBoard, refreshDelayMs]
	);

	const removeEntryByPath = React.useCallback((filePath: string) => {
		const entriesByFile = entriesByFileRef.current;
		const entriesByColumn = entriesByColumnRef.current;
		const affectedColumns = new Set<string>();
		const existingEntry = entriesByFile.get(filePath);

		if (!existingEntry) return affectedColumns;

		const columnEntries = entriesByColumn.get(existingEntry.columnId);
		if (columnEntries) {
			const index = columnEntries.findIndex(
				(entry) => entry.filePath === filePath
			);
			if (index !== -1) {
				columnEntries.splice(index, 1);
			}
		}

		entriesByFile.delete(filePath);
		affectedColumns.add(existingEntry.columnId);
		return affectedColumns;
	}, []);

	const updateEntryForFile = React.useCallback(
		(file: TFile) => {
			const currentConfig = configRef.current;
			const columnLookup = columnLookupRef.current;
			const entriesByFile = entriesByFileRef.current;
			const entriesByColumn = entriesByColumnRef.current;
			const affectedColumns = new Set<string>();

			if (!columnLookup) return affectedColumns;

			const nextEntry = resolveBoardEntryForFile(
				app,
				file,
				currentConfig,
				columnLookup,
				{
					logPrefix,
					logItemErrors,
				}
			);
			const existingEntry = entriesByFile.get(file.path);

			if (!nextEntry) {
				if (existingEntry) {
					const removed = removeEntryByPath(file.path);
					for (const columnId of removed) {
						affectedColumns.add(columnId);
					}
				}
				return affectedColumns;
			}

			if (existingEntry) {
				if (existingEntry.columnId !== nextEntry.columnId) {
					const previousColumnEntries = entriesByColumn.get(
						existingEntry.columnId
					);
					if (previousColumnEntries) {
						const index = previousColumnEntries.findIndex(
							(entry) => entry.filePath === file.path
						);
						if (index !== -1) {
							previousColumnEntries.splice(index, 1);
						}
					}
					const nextColumnEntries =
						entriesByColumn.get(nextEntry.columnId) ?? [];
					if (!entriesByColumn.has(nextEntry.columnId)) {
						entriesByColumn.set(
							nextEntry.columnId,
							nextColumnEntries
						);
					}
					nextColumnEntries.push(nextEntry);
					entriesByFile.set(file.path, nextEntry);
					affectedColumns.add(existingEntry.columnId);
					affectedColumns.add(nextEntry.columnId);
				} else {
					existingEntry.item = nextEntry.item;
					existingEntry.frontmatter = nextEntry.frontmatter;
					existingEntry.columnId = nextEntry.columnId;
					entriesByFile.set(file.path, existingEntry);
					affectedColumns.add(existingEntry.columnId);
				}
				return affectedColumns;
			}

			const nextColumnEntries =
				entriesByColumn.get(nextEntry.columnId) ?? [];
			if (!entriesByColumn.has(nextEntry.columnId)) {
				entriesByColumn.set(nextEntry.columnId, nextColumnEntries);
			}
			nextColumnEntries.push(nextEntry);
			entriesByFile.set(file.path, nextEntry);
			affectedColumns.add(nextEntry.columnId);

			return affectedColumns;
		},
		[app, logItemErrors, logPrefix, removeEntryByPath]
	);

	React.useEffect(() => {
		rebuild();
	}, [config, rebuild]);

	React.useEffect(() => {
		const onMetadataChange = (file: TFile) => {
			if (!(file instanceof TFile)) return;
			const affected = updateEntryForFile(file);
			if (affected.size > 0) {
				scheduleRefresh(affected);
			}
		};

		const onCreate = (file: TFile) => {
			if (!(file instanceof TFile)) return;
			const affected = updateEntryForFile(file);
			if (affected.size > 0) {
				scheduleRefresh(affected);
			}
		};

		const onDelete = (file: TFile) => {
			if (!(file instanceof TFile)) return;
			const affected = removeEntryByPath(file.path);
			if (affected.size > 0) {
				scheduleRefresh(affected);
			}
		};

		const onRename = (file: TFile, oldPath: string) => {
			if (!(file instanceof TFile)) return;
			const affected = new Set<string>();
			const removed = removeEntryByPath(oldPath);
			for (const columnId of removed) {
				affected.add(columnId);
			}
			const updated = updateEntryForFile(file);
			for (const columnId of updated) {
				affected.add(columnId);
			}
			if (affected.size > 0) {
				scheduleRefresh(affected);
			}
		};

		const metadataRef = app.metadataCache.on("changed", onMetadataChange);
		const createRef = app.vault.on("create", onCreate);
		const deleteRef = app.vault.on("delete", onDelete);
		const renameRef = app.vault.on("rename", onRename);

		return () => {
			app.metadataCache.offref(metadataRef);
			app.vault.offref(createRef);
			app.vault.offref(deleteRef);
			app.vault.offref(renameRef);
			if (refreshTimerRef.current !== null) {
				window.clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
			kanbanInstanceRef.current = null;
		};
	}, [app, removeEntryByPath, scheduleRefresh, updateEntryForFile]);

	React.useEffect(() => {
		if (!kanbanInstanceRef.current) return;
		scheduleRefresh(undefined, true);
	}, [
		groupBy,
		groupLabel,
		groupOrder,
		itemClassName,
		renderItem,
		runtimeFilter,
		runtimeSort,
		scheduleRefresh,
	]);

	React.useEffect(() => {
		if (!onCardClick) return;
		const container = containerRef.current;
		if (!container) return;

		console.log(`[${logPrefix}] click handler attached`, {
			boardId,
		});

		const handleForceSplit = (event: MouseEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			const target = event.target as HTMLElement | null;
			if (!target) return;

			const itemEl = target.closest(".kanban-item") as HTMLElement | null;
			if (!itemEl) return;
			if (itemEl.classList.contains("kanban-group-header")) return;

			const itemId = itemEl.dataset.eid;
			if (!itemId) return;

			lastForceSplitRef.current = {
				itemId,
				at: Date.now(),
			};
			console.log(
				`[${logPrefix}] ctrl/meta mousedown`,
				{ itemId }
			);
			onCardClick(event, itemId, itemEl);
		};

		const handleClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) {
				console.log(`[${logPrefix}] click ignored: no target`);
				return;
			}

			const itemEl = target.closest(".kanban-item") as HTMLElement | null;
			if (!itemEl) {
				console.log(`[${logPrefix}] click ignored: no item`);
				return;
			}
			if (itemEl.classList.contains("kanban-group-header")) {
				console.log(
					`[${logPrefix}] click ignored: group header`,
					itemEl.dataset.eid ?? "unknown"
				);
				return;
			}
			if (isDragInProgressRef.current) {
				console.log(
					`[${logPrefix}] click ignored: drag in progress`,
					itemEl.dataset.eid ?? "unknown"
				);
				return;
			}

			const timeSinceDrag = Date.now() - lastDragTimeRef.current;
			if (
				timeSinceDrag < clickBlockMs ||
				itemEl.classList.contains("is-dragging") ||
				itemEl.classList.contains("is-moving")
			) {
				console.log(
					`[${logPrefix}] click ignored: drag cooldown`,
					{
						itemId: itemEl.dataset.eid ?? "unknown",
						timeSinceDrag,
						clickBlockMs,
						isDragging: itemEl.classList.contains("is-dragging"),
						isMoving: itemEl.classList.contains("is-moving"),
						ctrlKey: event.ctrlKey,
						metaKey: event.metaKey,
					}
				);
				return;
			}

			const itemId = itemEl.dataset.eid;
			if (!itemId) {
				console.log(`[${logPrefix}] click ignored: missing itemId`);
				return;
			}
			const forceSplit = lastForceSplitRef.current;
			if (
				forceSplit &&
				forceSplit.itemId === itemId &&
				Date.now() - forceSplit.at < 750
			) {
				console.log(
					`[${logPrefix}] click ignored: handled on mousedown`,
					{ itemId }
				);
				return;
			}
			console.log(
				`[${logPrefix}] click handled`,
				{
					itemId,
					ctrlKey: event.ctrlKey,
					metaKey: event.metaKey,
				}
			);
			onCardClick(event, itemId, itemEl);
		};

		container.addEventListener("mousedown", handleForceSplit, true);
		container.addEventListener("click", handleClick);
		return () => {
			container.removeEventListener("mousedown", handleForceSplit, true);
			container.removeEventListener("click", handleClick);
		};
	}, [clickBlockMs, onCardClick]);

	return { containerRef, rebuild };
};
