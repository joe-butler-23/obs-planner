import * as React from "react";
import { type ParentConfig } from "@formkit/drag-and-drop";
import { useDragAndDrop } from "@formkit/drag-and-drop/react";

interface KanbanColumnProps<T> {
	id: string;
	title: string;
	items: T[];
	/** Factory function that creates isolated config for this column */
	getColumnConfig: (columnId: string) => Partial<ParentConfig<T>>;
	getItemKey: (item: T) => string;
	renderItem: (item: T) => React.ReactNode;
	dropTargetClassName: string;
	dropTargetParentClassName: string;
	insertIndicatorClassName: string;
	className?: string;
}

export const KanbanColumn = <T,>({
	id,
	title,
	items,
	getColumnConfig,
	getItemKey,
	renderItem,
	dropTargetClassName,
	dropTargetParentClassName,
	insertIndicatorClassName,
	className,
}: KanbanColumnProps<T>) => {
	// CRITICAL: Create isolated config for this column instance
	// This ensures each column gets fresh plugin instances, fixing the FormKit bug
	const dndConfig = React.useMemo(
		() => getColumnConfig(id),
		[getColumnConfig, id]
	);

	const [parent, list, setList] = useDragAndDrop<HTMLDivElement, T>(
		items,
		dndConfig
	);

	// Sync external items with internal list
	React.useLayoutEffect(() => {
		setList(items);
	}, [items, setList]);

	const cleanupIndicators = React.useCallback(
		(parentEl: HTMLElement) => {
			parentEl.classList.remove(dropTargetClassName);
			parentEl.classList.remove(dropTargetParentClassName);
			document
				.querySelectorAll(`.${insertIndicatorClassName}`)
				.forEach((node) => {
					if (node instanceof HTMLElement) {
						node.style.display = "none";
					}
				});
		},
		[
			dropTargetClassName,
			dropTargetParentClassName,
			insertIndicatorClassName,
		]
	);

	const handleDragLeave = React.useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			const parentEl = event.currentTarget;
			const rect = parentEl.getBoundingClientRect();
			const isOutside =
				event.clientX < rect.left ||
				event.clientX > rect.right ||
				event.clientY < rect.top ||
				event.clientY > rect.bottom;
			if (!isOutside) return;
			cleanupIndicators(parentEl);
		},
		[cleanupIndicators]
	);

	const handleDrop = React.useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			cleanupIndicators(event.currentTarget);
		},
		[cleanupIndicators]
	);

	return (
		<div className={`organiser-column ${className ?? ""}`}>
			<h3>{title}</h3>
			<div
				ref={parent}
				className="column-content"
				data-column-id={id}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{list.map((item) => (
					<React.Fragment key={getItemKey(item)}>
						{renderItem(item)}
					</React.Fragment>
				))}
			</div>
		</div>
	);
};
