import * as React from "react";
import { App, TFile, getAllTags } from "obsidian";
import { type TransferEventData, type SortEventData } from "@formkit/drag-and-drop";
import { BoardConfig, BaseKanbanItem, ColumnDefinition } from "../types/kanban-config";
import { KanbanColumn } from "./KanbanColumn";
import { useKanbanDragAndDropFactory } from "../hooks/useKanbanDragAndDropFactory";
import { FieldManager, getItemColumn } from "../utils/field-manager";

interface KanbanBoardProps<T extends BaseKanbanItem> {
	app: App;
	config: BoardConfig<T>;
	/** Function to render each item card */
	renderItem: (item: T, dragHandleClassName: string) => React.ReactNode;
	/** Optional header component */
	header?: React.ReactNode;
	/** Optional function to get item key (defaults to item.id) */
	getItemKey?: (item: T) => string;
	/** Optional callback when item is clicked */
	onItemClick?: (item: T) => void;
	/** Custom class name for the board container */
	className?: string;
	/** Card class name for drag detection */
	cardClassName?: string;
}

const getColumnIdFromElement = (
	parent?: { el: HTMLElement }
): string | undefined => {
	return parent?.el?.dataset?.columnId;
};

const areItemsEqual = <T extends BaseKanbanItem>(a: T, b: T) =>
	a.id === b.id && a.title === b.title && a.path === b.path;

const areColumnsEqual = <T extends BaseKanbanItem>(
	prev: Record<string, T[]>,
	next: Record<string, T[]>,
	getKey: (item: T) => string
) => {
	const prevKeys = Object.keys(prev);
	const nextKeys = Object.keys(next);

	if (prevKeys.length !== nextKeys.length) return false;

	for (const key of nextKeys) {
		if (!Object.prototype.hasOwnProperty.call(prev, key)) return false;
		const prevItems = prev[key] ?? [];
		const nextItems = next[key] ?? [];
		if (prevItems.length !== nextItems.length) return false;
		for (let i = 0; i < nextItems.length; i++) {
			if (getKey(prevItems[i]) !== getKey(nextItems[i])) return false;
		}
	}

	return true;
};

export const KanbanBoard = <T extends BaseKanbanItem>({
	app,
	config,
	renderItem,
	header,
	getItemKey = (item) => item.id,
	onItemClick,
	className,
	cardClassName = "kanban-card",
}: KanbanBoardProps<T>) => {
	const [columnItems, setColumnItems] = React.useState<Record<string, T[]>>(
		{}
	);
	const columnItemsRef = React.useRef<Record<string, T[]>>({});
	const boardRef = React.useRef<HTMLDivElement>(null);
	const lastTransferRef = React.useRef<string | null>(null);

	const fieldManager = React.useMemo(() => new FieldManager(app), [app]);

	// Derived value - only render columns when data is loaded
	const hasLoadedData = Object.keys(columnItems).length > 0;

	// Sync ref with state
	React.useEffect(() => {
		columnItemsRef.current = columnItems;
	}, [columnItems]);

	// Load and categorize items
	const refreshItems = React.useCallback(() => {
		const files = app.vault.getMarkdownFiles();
		const itemsByColumn: Record<string, T[]> = {};

		// Initialize all columns
		for (const column of config.columns) {
			itemsByColumn[column.id] = [];
		}

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const frontmatter = cache.frontmatter || {};

			// Apply item filter if configured
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

			// Transform file to item
			const item: T = config.itemTransformer
				? config.itemTransformer(file, frontmatter)
				: ({
						id: file.path,
						title:
							(frontmatter.title as string) || file.basename,
						path: file.path,
					} as T);

			// Determine which column the item belongs to
			const columnId = getItemColumn(
				frontmatter,
				config.columns,
				config.fieldMapping
			);

			// Only add items that belong to a column in the current view
			if (columnId && itemsByColumn[columnId]) {
				itemsByColumn[columnId].push(item);
			}
		}

		// Preserve order from previous state where possible
		const previous = columnItemsRef.current;
		const newColumns: Record<string, T[]> = {};

		for (const columnId of Object.keys(itemsByColumn)) {
			const newItems = itemsByColumn[columnId];
			const prevItems = previous[columnId] ?? [];

			// Keep items that still exist in their previous order
			const prevIds = prevItems.map(getItemKey);
			const newIds = new Set(newItems.map(getItemKey));

			const orderedIds = prevIds.filter((id) => newIds.has(id));
			const addedIds = newItems
				.filter((item) => !orderedIds.includes(getItemKey(item)))
				.map(getItemKey);

			const allIds = [...orderedIds, ...addedIds];
			const itemMap = new Map(
				newItems.map((item) => [getItemKey(item), item])
			);

			newColumns[columnId] = allIds
				.map((id) => itemMap.get(id))
				.filter((item): item is T => item !== undefined);
		}

		// Only update if columns actually changed
		if (!areColumnsEqual(previous, newColumns, getItemKey)) {
			setColumnItems(newColumns);
		}
	}, [app, config, getItemKey]);

	// Initial load and metadata change listener
	React.useEffect(() => {
		refreshItems();
		const ref = app.metadataCache.on("changed", refreshItems);
		return () => app.metadataCache.offref(ref);
	}, [app, refreshItems]);

	// Handle sort within column
	const handleSort = React.useCallback(
		(columnId: string, data: SortEventData<T>) => {
			setColumnItems((prev) => ({
				...prev,
				[columnId]: data.values as T[],
			}));
		},
		[]
	);

	// Handle transfer between columns
	const handleTransfer = React.useCallback(
		(data: TransferEventData<T>) => {
			const draggedItem = data.draggedNodes[0]?.data.value;
			const targetColumnId = getColumnIdFromElement(data.targetParent);
			const sourceColumnId = getColumnIdFromElement(data.sourceParent);

			if (!draggedItem || !targetColumnId) {
				return;
			}

			// Deduplicate rapid transfers
			const transferKey = `${getItemKey(draggedItem)}:${targetColumnId}`;
			if (lastTransferRef.current === transferKey) return;
			lastTransferRef.current = transferKey;
			setTimeout(() => {
				if (lastTransferRef.current === transferKey) {
					lastTransferRef.current = null;
				}
			}, 0);

			// Find target column definition
			const targetColumn = config.columns.find(
				(c) => c.id === targetColumnId
			);
			if (!targetColumn) {
				return;
			}

			// Update frontmatter
			const file = app.vault.getAbstractFileByPath(draggedItem.id);
			if (file instanceof TFile) {
				fieldManager
					.updateFieldForColumn(
						file,
						targetColumn,
						config.fieldMapping
					)
					.catch((error) => {
						console.error(
							"[KanbanBoard] Failed to update frontmatter",
							error
						);
					});
			}

			// Update UI state
			setColumnItems((prev) => {
				const next = { ...prev };
				const targetItems = data.targetParent.data.getValues(
					data.targetParent.el
				) as T[];
				next[targetColumnId] = targetItems;

				if (sourceColumnId && sourceColumnId !== targetColumnId) {
					const sourceItems = data.sourceParent.data.getValues(
						data.sourceParent.el
					) as T[];
					next[sourceColumnId] = sourceItems;
				}

				return next;
			});
		},
		[app, config, fieldManager, getItemKey]
	);

	// Factory hook for isolated FormKit configs
	const { getColumnConfig, isDraggingRef, dragHandleClassName, classNames } =
		useKanbanDragAndDropFactory<T>({
			scopeRef: boardRef,
			group: config.dragGroup ?? config.id,
			onSort: handleSort,
			onTransfer: handleTransfer,
			cardClassName,
		});

	// Render item - pass click handler to renderItem, don't wrap in extra div
	// (FormKit needs direct children to have the card class for drag detection)
	const renderItemWithHandler = React.useCallback(
		(item: T) => {
			return renderItem(item, dragHandleClassName);
		},
		[renderItem, dragHandleClassName]
	);

	if (!hasLoadedData) {
		return (
			<div className={className ?? ""}>
				<div className="organiser-layout organiser-loading">Loading...</div>
			</div>
		);
	}

	return (
		<div ref={boardRef} className={className ?? ""}>
			{header}
			<div className="organiser-layout">
				{config.columns.map((column) => (
					<KanbanColumn
						key={column.id}
						id={column.id}
						title={column.title}
						items={columnItems[column.id] ?? []}
						getColumnConfig={getColumnConfig}
						getItemKey={getItemKey}
						renderItem={renderItemWithHandler}
						dropTargetClassName={classNames.dropTarget}
						dropTargetParentClassName={classNames.dropTargetParent}
						insertIndicatorClassName={classNames.insertIndicator}
						className={column.className}
					/>
				))}
			</div>
		</div>
	);
};
