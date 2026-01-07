import { FieldType } from "../types/kanban-config";

export type OrganiserPresetId =
	| "weekly"
	| "meal"
	| "exercise"
	| "task";

export interface PresetFieldDefinition {
	key: string;
	label: string;
	type: FieldType;
	groupable?: boolean;
	sortable?: boolean;
}

export interface OrganiserPreset {
	id: OrganiserPresetId;
	label: string;
	description: string;
	isTimeBased: boolean;
	typeFilter: string[];
	fields: PresetFieldDefinition[];
}

const baseFields = (): PresetFieldDefinition[] => [
	{
		key: "type",
		label: "Type",
		type: "enum",
		groupable: true,
		sortable: true,
	},
];

export const ORGANISER_PRESETS: OrganiserPreset[] = [
	{
		id: "weekly",
		label: "Weekly Planner",
		description: "All scheduled items for the week.",
		isTimeBased: true,
		typeFilter: ["recipe", "exercise", "task"],
		fields: baseFields(),
	},
	{
		id: "meal",
		label: "Meal Planner",
		description: "Plan recipes across the week.",
		isTimeBased: true,
		typeFilter: ["recipe"],
		fields: baseFields(),
	},
	{
		id: "exercise",
		label: "Exercise Planner",
		description: "Schedule workouts for the week.",
		isTimeBased: true,
		typeFilter: ["exercise"],
		fields: baseFields(),
	},
	{
		id: "task",
		label: "Task Planner",
		description: "Track tasks across the week.",
		isTimeBased: true,
		typeFilter: ["task"],
		fields: baseFields(),
	},
];

export const findPresetById = (
	id: OrganiserPresetId | string
): OrganiserPreset => {
	const match = ORGANISER_PRESETS.find((preset) => preset.id === id);
	return match ?? ORGANISER_PRESETS[0];
};
