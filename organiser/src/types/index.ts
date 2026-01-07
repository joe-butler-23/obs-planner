// Re-export all kanban configuration types
export * from "./kanban-config";

import { BaseKanbanItem } from "./kanban-config";

export type OrganiserItemType = "recipe" | "exercise" | "task" | "unknown";

/**
 * Extended item for the Weekly Organiser (backward compatible)
 */
export interface OrganiserItem extends BaseKanbanItem {
	type: OrganiserItemType;
	coverImage?: string;
	date?: string; // YYYY-MM-DD
	marked?: boolean;
}

/**
 * @deprecated Use BoardConfig with columns instead
 */
export interface WeeklyData {
	days: {
		[key: string]: OrganiserItem[]; // YYYY-MM-DD -> Items
	};
	marked: OrganiserItem[];
}
