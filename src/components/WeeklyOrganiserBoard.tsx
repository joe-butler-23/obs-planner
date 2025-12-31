import * as React from "react";
import { App, TFile, getAllTags, moment } from "obsidian";
import jKanbanModule from "jkanban";
import { BoardConfig, ColumnDefinition } from "../types/kanban-config";
import { OrganiserItem } from "../types";
import { FieldManager, getItemColumn } from "../utils/field-manager";

// Type cast for moment (Obsidian re-exports it)
const momentFn: any = moment;

interface WeeklyOrganiserBoardProps {
	app: App;
}

type JKanbanCtor = new (options: any) => any;

const resolveKanbanConstructor = (): JKanbanCtor => {
	const moduleAny = jKanbanModule as unknown as {
		default?: unknown;
		jKanban?: unknown;
	};
	const globalAny = globalThis as { jKanban?: unknown };

	const candidate =
		(typeof moduleAny.default === "function" && moduleAny.default) ||
		(typeof (moduleAny.default as { jKanban?: unknown })?.jKanban ===
			"function" &&
			(moduleAny.default as { jKanban?: unknown }).jKanban) ||
		(typeof moduleAny.jKanban === "function" && moduleAny.jKanban) ||
		(typeof jKanbanModule === "function" && jKanbanModule) ||
		(typeof globalAny.jKanban === "function" && globalAny.jKanban) ||
		(typeof (window as { jKanban?: unknown }).jKanban === "function" &&
			(window as { jKanban?: unknown }).jKanban);

	if (typeof candidate !== "function") {
		throw new Error("jKanban constructor not available");
	}

	return candidate as JKanbanCtor;
};

/**
 * Generates column definitions for a week starting from Monday
 */
const generateWeekColumns = (weekOffset: number): ColumnDefinition[] => {
	const startOfWeek = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek"); // Monday

	const markedColumn: ColumnDefinition = {
		id: "marked",
		title: "Marked",
		fieldValue: undefined,
		isDefault: true,
	};

	const dayColumns: ColumnDefinition[] = [];
	for (let i = 0; i < 7; i++) {
		const date = startOfWeek.clone().add(i, "days");
		dayColumns.push({
			id: date.format("YYYY-MM-DD"),
			title: date.format("ddd Do"),
			fieldValue: date.format("YYYY-MM-DD"),
		});
	}

	return [markedColumn, ...dayColumns];
};

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});

const toSafeString = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : String(value);
};

const renderCardHTML = (item: OrganiserItem): string => {
	const isRecipe = item.type === "recipe";
	const icon = isRecipe
		? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`
		: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`;

	const title = escapeHtml(toSafeString(item.title));
	const coverImage =
		typeof item.coverImage === "string"
			? escapeHtml(item.coverImage)
			: "";

	const imageHTML = coverImage
		? `<div class="card-cover"><img src="${coverImage}" alt="${title}" draggable="false" /></div>`
		: "";

	return `
		<div class="organiser-card-content">
			${imageHTML}
			<div class="card-header">
				${icon}
				<div class="card-title">${title}</div>
			</div>
		</div>
	`;
};

/**
 * Weekly Organiser Board - jKanban implementation
 */
export const WeeklyOrganiserBoard = ({ app }: WeeklyOrganiserBoardProps) => {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const kanbanInstanceRef = React.useRef<any>(null);
	const isInternalUpdateRef = React.useRef(false);
	const lastDragTimeRef = React.useRef(0);
	const [weekOffset, setWeekOffset] = React.useState(0);
	const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
	const calendarInputRef = React.useRef<HTMLInputElement>(null);

	const boardId = React.useMemo(
		() => `weekly-organiser-board-${Math.random().toString(36).slice(2, 11)}`,
		[]
	);

	const fieldManager = React.useMemo(() => new FieldManager(app), [app]);

	// Generate columns based on current week offset
	const columns = React.useMemo(
		() => generateWeekColumns(weekOffset),
		[weekOffset]
	);

	// Board configuration - regenerated when week changes
	const config: BoardConfig<OrganiserItem> = React.useMemo(
		() => ({
			id: "weekly-organiser",
			name: "Weekly Organiser",
			columns,
			fieldMapping: {
				field: "scheduled",
				type: "date",
				fallbackField: "date",
				defaultField: "marked",
			},
			itemFilter: {
				customFilter: (file, _frontmatter) => {
					const isRecipePath = file.path
						.toLowerCase()
						.includes("recipe");
					const isExercisePath = file.path
						.toLowerCase()
						.includes("exercise");
					return isRecipePath || isExercisePath;
				},
			},
			itemTransformer: (file, frontmatter) => {
				const isRecipe = file.path.toLowerCase().includes("recipe");
				return {
					id: file.path,
					title: (frontmatter.title as string) || file.basename,
					path: file.path,
					type: isRecipe ? "recipe" : "exercise",
					coverImage: (frontmatter.cover ||
						frontmatter.image) as string | undefined,
					date: frontmatter.scheduled as string | undefined,
					marked: frontmatter.marked === true,
				};
			},
		}),
		[columns]
	);

	const buildBoardsData = React.useCallback(() => {
		const files = app.vault.getMarkdownFiles();
		const boardsData = config.columns.map((col) => ({
			id: col.id,
			title: col.title,
			item: [] as { id: string; title: string; class: string }[],
		}));
		const boardMap = new Map(boardsData.map((board) => [board.id, board]));

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			if (!cache) continue;
			const frontmatter = cache.frontmatter || {};

			if (config.itemFilter) {
				const {
					pathPattern,
					requiredTags,
					requiredFields,
					customFilter,
				} = config.itemFilter;

				if (pathPattern && !pathPattern.test(file.path)) continue;

				if (requiredTags) {
					const fileTags = getAllTags(cache) ?? [];
					const hasTags = requiredTags.some((tag) =>
						fileTags.includes(tag)
					);
					if (!hasTags) continue;
				}

				if (requiredFields) {
					const hasFields = requiredFields.every(
						(field) => frontmatter[field] !== undefined
					);
					if (!hasFields) continue;
				}

				if (customFilter && !customFilter(file, frontmatter)) continue;
			}

			let item: OrganiserItem;
			try {
				item = config.itemTransformer
					? config.itemTransformer(file, frontmatter)
					: (({
							id: file.path,
							title:
								(frontmatter.title as string) ||
								file.basename,
							path: file.path,
						} as OrganiserItem));
			} catch {
				continue;
			}

			const columnId = getItemColumn(
				frontmatter,
				config.columns,
				config.fieldMapping
			);

			if (columnId) {
				const board = boardMap.get(columnId);
				if (board) {
					board.item.push({
						id: item.id,
						title: renderCardHTML(item),
						class: "organiser-card",
					});
				}
			}
		}

		return boardsData;
	}, [app, config]);

	const initKanban = React.useCallback(
		(initialBoards: any[] = []) => {
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
						el.classList.add("is-dragging");
					},
					dragendEl: (el: HTMLElement) => {
						el.classList.remove("is-dragging");
						lastDragTimeRef.current = Date.now();
					},
					dropEl: (
						el: HTMLElement,
						target: HTMLElement,
						_source: HTMLElement,
						_sibling: HTMLElement
					) => {
						const itemId = el.dataset.eid;
						const targetBoardId =
							target.parentElement?.dataset.id;

						isInternalUpdateRef.current = true;

						if (itemId && targetBoardId) {
							const file = app.vault.getAbstractFileByPath(
								itemId
							);
							const targetColumn = config.columns.find(
								(c) => c.id === targetBoardId
							);

							if (file instanceof TFile && targetColumn) {
								fieldManager.updateFieldForColumn(
									file,
									targetColumn,
									config.fieldMapping
								);
							}
						}
					},
				});

				kanbanInstanceRef.current = kanban;
			} catch (err) {
				console.error(
					"[WeeklyOrganiser] Error initializing jKanban",
					err
				);
			}
		},
		[app, boardId, config, fieldManager]
	);

	const refreshBoard = React.useCallback(() => {
		if (!kanbanInstanceRef.current) return;
		if (isInternalUpdateRef.current) {
			isInternalUpdateRef.current = false;
			return;
		}

		const boards = buildBoardsData();
		initKanban(boards);
	}, [buildBoardsData, initKanban]);

	const handleCardClick = React.useCallback(
		(event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;

			const itemEl = target.closest(".kanban-item") as HTMLElement | null;
			if (!itemEl) return;

			const timeSinceDrag = Date.now() - lastDragTimeRef.current;
			if (
				timeSinceDrag < 250 ||
				itemEl.classList.contains("is-dragging") ||
				itemEl.classList.contains("is-moving")
			) {
				return;
			}

			const itemId = itemEl.dataset.eid;
			if (!itemId) return;

			const file = app.vault.getAbstractFileByPath(itemId);
			if (!(file instanceof TFile)) return;

			const isCtrlClick = event.ctrlKey || event.metaKey;
			const isImageClick = !!target.closest(".card-cover");

			if (isCtrlClick && isImageClick) {
				const leaf = app.workspace.getLeaf("split", "vertical");
				leaf.openFile(file, { active: true });
				return;
			}

			const leaf = app.workspace.getLeaf("split", "vertical");
			leaf.openFile(file, { active: true });
		},
		[app]
	);

	React.useEffect(() => {
		const initialBoards = buildBoardsData();
		initKanban(initialBoards);

		const ref = app.metadataCache.on("changed", refreshBoard);

		return () => {
			app.metadataCache.offref(ref);
			kanbanInstanceRef.current = null;
		};
	}, [app, buildBoardsData, initKanban, refreshBoard, weekOffset]);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onClick = (event: MouseEvent) => handleCardClick(event);
		container.addEventListener("click", onClick);

		return () => {
			container.removeEventListener("click", onClick);
		};
	}, [handleCardClick]);

	// Week navigation
	const startDate = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek");
	const endDate = startDate.clone().add(6, "days");
	const weekRangeDisplay = `${startDate.format("MMM Do")} - ${endDate.format("MMM Do, YYYY")}`;
	const startDateValue = startDate.format("YYYY-MM-DD");

	React.useEffect(() => {
		if (!isCalendarOpen) return;
		const input = calendarInputRef.current as
			| (HTMLInputElement & { showPicker?: () => void })
			| null;
		if (!input) return;

		requestAnimationFrame(() => {
			input.focus();
			if (typeof input.showPicker === "function") {
				input.showPicker();
			} else {
				input.click();
			}
		});
	}, [isCalendarOpen]);

	const handleCalendarChange = (value: string) => {
		if (!value) return;
		const selected = momentFn(value);
		if (!selected.isValid()) return;
		const offset = selected
			.startOf("isoWeek")
			.diff(momentFn().startOf("isoWeek"), "weeks");
		setWeekOffset(offset);
		setIsCalendarOpen(false);
	};

	return (
		<div className="weekly-organiser-container">
			<div className="organiser-header">
				<div className="week-nav">
					<button onClick={() => setWeekOffset((prev) => prev - 1)}>
						&lt;
					</button>
					<button onClick={() => setWeekOffset(0)}>Today</button>
					<div className="week-nav-calendar">
						<button
							className="calendar-toggle"
							aria-label="Choose week"
							onClick={() =>
								setIsCalendarOpen((prev) => !prev)
							}
							type="button"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width="16"
								height="16"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
								<line x1="16" y1="2" x2="16" y2="6" />
								<line x1="8" y1="2" x2="8" y2="6" />
								<line x1="3" y1="10" x2="21" y2="10" />
							</svg>
						</button>
						{isCalendarOpen && (
							<div className="calendar-popover">
								<input
									ref={calendarInputRef}
									type="date"
									aria-label="Choose week"
									value={startDateValue}
									onChange={(event) =>
										handleCalendarChange(
											event.target.value
										)
									}
									onBlur={() => setIsCalendarOpen(false)}
								/>
							</div>
						)}
					</div>
					<button onClick={() => setWeekOffset((prev) => prev + 1)}>
						&gt;
					</button>
				</div>
				<h2>{weekRangeDisplay}</h2>
			</div>
			<div
				id={boardId}
				ref={containerRef}
				className="weekly-organiser-kanban"
				style={{ overflowX: "auto", height: "calc(100% - 70px)" }}
			/>
		</div>
	);
};
