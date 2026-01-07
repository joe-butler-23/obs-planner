import { App, TFile } from "obsidian";
import { BaseKanbanItem, BoardConfig } from "../types/kanban-config";
import {
	ColumnLookup,
	createColumnLookup,
	getItemColumn,
} from "../utils/field-manager";
import { matchesItemFilter } from "./itemFilter";

export interface KanbanBoardData {
	id: string;
	title: string;
	item: { id: string; title: string; class: string }[];
}

export interface BoardEntry<T extends BaseKanbanItem> {
	filePath: string;
	item: T;
	frontmatter: Record<string, unknown>;
	columnId: string;
}

interface BuildEntriesOptions {
	logPrefix?: string;
	logItemErrors?: boolean;
	columnLookup?: ColumnLookup;
}

interface BuildBoardsOptions<T extends BaseKanbanItem> {
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
	logPrefix?: string;
	logItemErrors?: boolean;
}

export const resolveBoardEntryForFile = <T extends BaseKanbanItem>(
	app: App,
	file: TFile,
	config: BoardConfig<T>,
	columnLookup: ColumnLookup,
	options: BuildEntriesOptions = {}
): BoardEntry<T> | null => {
	const cache = app.metadataCache.getFileCache(file);
	if (!cache) return null;

	const frontmatter = cache.frontmatter || {};
	if (!matchesItemFilter(file, cache, config.itemFilter)) return null;

	let item: T;
	try {
		item = config.itemTransformer
			? config.itemTransformer(file, frontmatter)
			: (({
					id: file.path,
					title: (frontmatter.title as string) || file.basename,
					path: file.path,
				} as T));
	} catch (err) {
		if (options.logItemErrors) {
			const prefix = options.logPrefix ? `[${options.logPrefix}] ` : "";
			console.warn(
				`${prefix}Item transformer failed for ${file.path}`,
				err
			);
		}
		return null;
	}

	const columnId = getItemColumn(
		frontmatter,
		config.columns,
		config.fieldMapping,
		columnLookup
	);

	if (!columnId) return null;

	return {
		filePath: file.path,
		item,
		frontmatter,
		columnId,
	};
};

export const buildBoardEntries = <T extends BaseKanbanItem>(
	app: App,
	config: BoardConfig<T>,
	options: BuildEntriesOptions = {}
): {
	entriesByColumn: Map<string, BoardEntry<T>[]>;
	entriesByFile: Map<string, BoardEntry<T>>;
	columnLookup: ColumnLookup;
} => {
	const columnLookup =
		options.columnLookup ?? createColumnLookup(config.columns);
	const entriesByColumn = new Map<string, BoardEntry<T>[]>();
	const entriesByFile = new Map<string, BoardEntry<T>>();

	for (const column of config.columns) {
		entriesByColumn.set(column.id, []);
	}

	for (const file of app.vault.getMarkdownFiles()) {
		const entry = resolveBoardEntryForFile(
			app,
			file,
			config,
			columnLookup,
			options
		);
		if (!entry) continue;
		entriesByFile.set(entry.filePath, entry);
		const entries = entriesByColumn.get(entry.columnId);
		if (entries) {
			entries.push(entry);
		}
	}

	return { entriesByColumn, entriesByFile, columnLookup };
};

export const buildBoardsFromEntries = <T extends BaseKanbanItem>(
	columns: BoardConfig<T>["columns"],
	boardEntries: Map<string, BoardEntry<T>[]>,
	renderItem: (item: T) => string,
	options: BuildBoardsOptions<T> = {}
): KanbanBoardData[] => {
	const {
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
	} = options;
	const boardsData = columns.map((col) => ({
		id: col.id,
		title: col.title,
		item: [] as { id: string; title: string; class: string }[],
	}));
	const resolvedClassName = itemClassName ?? "";

	const resolveGroupId = (value: string | undefined): string =>
		value && value.trim().length > 0 ? value : "Ungrouped";

	for (const board of boardsData) {
		const entries = boardEntries.get(board.id) ?? [];
		const filteredEntries = runtimeFilter
			? entries.filter(({ item, frontmatter }) =>
					runtimeFilter(item, frontmatter)
				)
			: entries;
		const sortedEntries = runtimeSort
			? [...filteredEntries].sort((a, b) =>
					runtimeSort(a.item, b.item)
				)
			: filteredEntries;

		if (!groupBy) {
			for (const entry of sortedEntries) {
				board.item.push({
					id: entry.item.id,
					title: renderItem(entry.item),
					class: resolvedClassName,
				});
			}
			continue;
		}

		const grouped = new Map<
			string,
			{ item: T; frontmatter: Record<string, unknown> }[]
		>();
		for (const entry of sortedEntries) {
			const rawGroup = groupBy(entry.item, entry.frontmatter);
			const groupId = resolveGroupId(
				rawGroup ? String(rawGroup) : undefined
			);
			const bucket = grouped.get(groupId);
			if (bucket) {
				bucket.push(entry);
			} else {
				grouped.set(groupId, [entry]);
			}
		}

		const groupIds = Array.from(grouped.keys());
		if (groupOrder) {
			groupIds.sort(groupOrder);
		} else {
			groupIds.sort((a, b) => a.localeCompare(b));
		}

		for (const groupId of groupIds) {
			const label = groupLabel ? groupLabel(groupId) : groupId;
			board.item.push({
				id: `__group:${board.id}:${groupId}`,
				title: `<div class="kanban-group-label">${label}</div>`,
				class: "kanban-group-header",
			});
			const groupEntries = grouped.get(groupId) ?? [];
			for (const entry of groupEntries) {
				board.item.push({
					id: entry.item.id,
					title: renderItem(entry.item),
					class: resolvedClassName,
				});
			}
		}
	}

	return boardsData;
};

export const buildBoardsData = <T extends BaseKanbanItem>(
	app: App,
	config: BoardConfig<T>,
	renderItem: (item: T) => string,
	options: BuildBoardsOptions<T> = {}
): KanbanBoardData[] => {
	const { entriesByColumn } = buildBoardEntries(app, config, options);

	return buildBoardsFromEntries(
		config.columns,
		entriesByColumn,
		renderItem,
		options
	);
};
