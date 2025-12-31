// Re-export all kanban configuration types
export * from "./kanban-config";

import { BaseKanbanItem } from "./kanban-config";

/**
 * Extended item for the Weekly Organiser (backward compatible)
 */
export interface OrganiserItem extends BaseKanbanItem {
	type: "recipe" | "exercise";
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
