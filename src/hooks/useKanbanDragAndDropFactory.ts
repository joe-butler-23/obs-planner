import * as React from "react";
import {
	animations,
	insert,
	type ParentConfig,
	type SortEventData,
	type TransferEventData,
} from "@formkit/drag-and-drop";

const DEFAULT_ANIMATION_CONFIG = { duration: 180, yScale: 16, xScale: 16 };
const DEFAULT_CLASSNAME_PREFIX = "kanban";

const buildClassNames = (prefix: string) => ({
	dragging: `${prefix}-dragging`,
	placeholder: `${prefix}-drag-placeholder`,
	dropTarget: `${prefix}-drop-target`,
	dropTargetParent: `${prefix}-dragged-over`,
	insertIndicator: `${prefix}-drop-indicator`,
});

const createInvisibleDragImage = () => {
	const dragImage = document.createElement("div");
	dragImage.style.width = "1px";
	dragImage.style.height = "1px";
	dragImage.style.opacity = "0";
	dragImage.style.position = "fixed";
	dragImage.style.left = "-9999px";
	dragImage.style.top = "-9999px";
	dragImage.style.pointerEvents = "none";
	return dragImage;
};

interface UseKanbanDragAndDropFactoryOptions<T> {
	scopeRef: React.RefObject<HTMLElement | null>;
	group: string;
	onSort: (columnId: string, data: SortEventData<T>) => void;
	onTransfer: (data: TransferEventData<T>) => void;
	classNamePrefix?: string;
	dragHandleSelector?: string;
	cardClassName?: string;
	animationConfig?: Parameters<typeof animations>[0];
}

/**
 * Factory hook that creates isolated FormKit configurations per column.
 *
 * CRITICAL: Each column gets fresh plugin instances to prevent
 * FormKit's internal state corruption when items transfer between columns.
 *
 * The insert plugin mutates the config via shallow copy, so sharing a single
 * config object across columns causes the first column to get "fresh" config
 * but subsequent columns get corrupted state.
 */
export const useKanbanDragAndDropFactory = <T,>({
	scopeRef,
	group,
	onSort,
	onTransfer,
	classNamePrefix = DEFAULT_CLASSNAME_PREFIX,
	dragHandleSelector,
	cardClassName = "kanban-card",
	animationConfig = DEFAULT_ANIMATION_CONFIG,
}: UseKanbanDragAndDropFactoryOptions<T>) => {
	const isDraggingRef = React.useRef(false);

	const classNames = React.useMemo(
		() => buildClassNames(classNamePrefix),
		[classNamePrefix]
	);

	const dragHandleClassName = `${classNamePrefix}-drag-surface`;
	const resolvedDragHandleSelector =
		dragHandleSelector ?? `.${dragHandleClassName}`;

	// Shared drag state handlers
	const handleDragStart = React.useCallback(() => {
		isDraggingRef.current = true;
	}, []);

	const handleDragEnd = React.useCallback(() => {
		setTimeout(() => {
			isDraggingRef.current = false;
		}, 0);
	}, []);

	// Stable references for config dependencies
	const onTransferRef = React.useRef(onTransfer);
	const onSortRef = React.useRef(onSort);

	React.useEffect(() => {
		onTransferRef.current = onTransfer;
	}, [onTransfer]);

	React.useEffect(() => {
		onSortRef.current = onSort;
	}, [onSort]);

	/**
	 * Factory function - creates a NEW config with FRESH plugin instances
	 * for each column. This is the key fix for the FormKit bug.
	 */
	const createColumnConfig = React.useCallback(
		(columnId: string): Partial<ParentConfig<T>> => {
			// CRITICAL: Create NEW plugin instances for each column
			const columnAnimationPlugin = animations(animationConfig);
			const columnInsertPlugin = insert<T>({
				insertPoint: () => {
					const indicator = document.createElement("div");
					indicator.className = classNames.insertIndicator;
					return indicator;
				},
				insertEvent: (data) => {
					const sourceEl = data.sourceParent?.el;
					const targetEl = data.targetParent?.el;
					const sourceColumnId =
						sourceEl?.dataset?.columnId ?? "unknown";
					const targetColumnId =
						targetEl?.dataset?.columnId ?? "unknown";

					if (sourceColumnId === "unknown" || targetColumnId === "unknown") {
						return;
					}

					if (sourceEl === targetEl) {
						const values = data.targetParent.data.getValues(
							targetEl
						) as T[];
						onSortRef.current(
							targetColumnId,
							{ values } as SortEventData<T>
						);
						return;
					}

					onTransferRef.current({
						sourceParent: data.sourceParent,
						targetParent: data.targetParent,
						initialParent: data.sourceParent,
						currentParent: data.targetParent,
						draggedNodes: data.draggedNodes,
						targetNodes: data.targetNodes,
						state: data.state,
					} as TransferEventData<T>);
				},
			});

			return {
				group,
				dragHandle: resolvedDragHandleSelector,
				draggable: (node) => {
					if (node.classList.contains(classNames.insertIndicator)) {
						return false;
					}
					if (node.classList.contains(cardClassName)) {
						return true;
					}
					return !!node.querySelector(resolvedDragHandleSelector);
				},
				draggingClass: classNames.dragging,
				dragPlaceholderClass: classNames.placeholder,
				synthDragPlaceholderClass: classNames.placeholder,
				dropZoneClass: classNames.dropTarget,
				dropZoneParentClass: classNames.dropTargetParent,
				dragImage: (data) => {
					const dragImage = createInvisibleDragImage();
					document.body.appendChild(dragImage);
					data.e.dataTransfer?.setDragImage(dragImage, 0, 0);
					return dragImage;
				},
				synthDragImage: () => {
					const dragImage = createInvisibleDragImage();
					return { dragImage, offsetX: 0, offsetY: 0 };
				},
				plugins: [columnAnimationPlugin, columnInsertPlugin],
				onTransfer: (data) =>
					onTransferRef.current(data as unknown as TransferEventData<T>),
				onSort: (data) =>
					onSortRef.current(columnId, data as unknown as SortEventData<T>),
				onDragstart: handleDragStart,
				onDragend: handleDragEnd,
			};
		},
		[
			scopeRef,
			group,
			resolvedDragHandleSelector,
			cardClassName,
			classNames,
			animationConfig,
			handleDragStart,
			handleDragEnd,
		]
	);

	// Cache configs per column ID - recreated when createColumnConfig changes
	const configCacheRef = React.useRef<Map<string, Partial<ParentConfig<T>>>>(
		new Map()
	);
	const configVersionRef = React.useRef(0);

	// Clear cache when factory dependencies change
	React.useEffect(() => {
		configVersionRef.current += 1;
		configCacheRef.current.clear();
	}, [createColumnConfig]);

	/**
	 * Get or create config for a column.
	 * Configs are cached for stable references but recreated when dependencies change.
	 */
	const getColumnConfig = React.useCallback(
		(columnId: string): Partial<ParentConfig<T>> => {
			const cached = configCacheRef.current.get(columnId);
			if (cached) return cached;

			const config = createColumnConfig(columnId);
			configCacheRef.current.set(columnId, config);
			return config;
		},
		[createColumnConfig]
	);

	return {
		getColumnConfig,
		createColumnConfig, // For cases where fresh config is always needed
		isDraggingRef,
		dragHandleClassName,
		classNames,
	};
};
