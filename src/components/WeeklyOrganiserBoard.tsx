import * as React from "react";
import { App, TFile, moment } from "obsidian";
import { BoardConfig, ColumnDefinition } from "../types/kanban-config";
import { OrganiserItem } from "../types";
import { KanbanBoard } from "./KanbanBoard";
import { Card } from "./Card";

// Type cast for moment (Obsidian re-exports it)
const momentFn: any = moment;

interface WeeklyOrganiserBoardProps {
	app: App;
}

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

/**
 * Weekly Organiser Board - a thin wrapper around the generic KanbanBoard
 * configured for weekly scheduling of recipes and exercises.
 */
export const WeeklyOrganiserBoard = ({ app }: WeeklyOrganiserBoardProps) => {
	const [weekOffset, setWeekOffset] = React.useState(0);

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
				// Match files in recipe or exercise paths, OR with those tags
				customFilter: (file, frontmatter) => {
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

	// Handle item click - open file in split view
	const handleItemClick = React.useCallback(
		(item: OrganiserItem) => {
			const file = app.vault.getAbstractFileByPath(item.id);
			if (file instanceof TFile) {
				const leaf = app.workspace.getLeaf("split", "vertical");
				leaf.openFile(file);
			}
		},
		[app]
	);

	// Handle image click (ctrl/cmd + click)
	const handleImageClick = React.useCallback(
		(e: React.MouseEvent, item: OrganiserItem) => {
			const file = app.vault.getAbstractFileByPath(item.id);
			if (file instanceof TFile) {
				const leaf = app.workspace.getLeaf("split", "vertical");
				leaf.openFile(file);
			}
		},
		[app]
	);

	// Week navigation
	const startDate = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek");
	const endDate = startDate.clone().add(6, "days");
	const weekRangeDisplay = `${startDate.format("MMM Do")} - ${endDate.format("MMM Do, YYYY")}`;

	// Header with week navigation
	const header = (
		<div className="organiser-header">
			<div className="week-nav">
				<button onClick={() => setWeekOffset((prev) => prev - 1)}>
					&lt;
				</button>
				<button onClick={() => setWeekOffset(0)}>Today</button>
				<button onClick={() => setWeekOffset((prev) => prev + 1)}>
					&gt;
				</button>
			</div>
			<h2>{weekRangeDisplay}</h2>
		</div>
	);

	// Render card using the existing Card component
	const renderCard = React.useCallback(
		(item: OrganiserItem, dragHandleClassName: string) => (
			<Card
				item={item}
				onImageClick={handleImageClick}
				onPointerDown={() => {}}
				dragSurfaceClassName={dragHandleClassName}
			/>
		),
		[handleImageClick]
	);

	return (
		<KanbanBoard
			app={app}
			config={config}
			renderItem={renderCard}
			header={header}
			onItemClick={handleItemClick}
			className="weekly-organiser-container"
			cardClassName="organiser-card"
		/>
	);
};
