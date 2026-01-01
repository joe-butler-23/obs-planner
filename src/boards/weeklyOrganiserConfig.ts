import { moment } from "obsidian";
import { BoardConfig, ColumnDefinition } from "../types/kanban-config";
import { OrganiserItem } from "../types";

const momentFn: any = moment;

export const generateWeekColumns = (
	weekOffset: number
): ColumnDefinition[] => {
	const startOfWeek = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek");

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
			title: date.format("ddd Do MMM"),
			fieldValue: date.format("YYYY-MM-DD"),
		});
	}

	return [markedColumn, ...dayColumns];
};

export const createWeeklyOrganiserConfig = (
	weekOffset: number
): BoardConfig<OrganiserItem> => ({
	id: "weekly-organiser",
	name: "Weekly Organiser",
	columns: generateWeekColumns(weekOffset),
	fieldMapping: {
		field: "scheduled",
		type: "date",
		fallbackField: "date",
		defaultField: "marked",
	},
	itemFilter: {
		customFilter: (file) => {
			const isRecipePath = file.path.toLowerCase().includes("recipe");
			const isExercisePath = file.path.toLowerCase().includes("exercise");
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
});
