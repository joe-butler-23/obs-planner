import { moment } from "obsidian";
import { BoardConfig, ColumnDefinition } from "../types/kanban-config";
import { OrganiserItem, OrganiserItemType } from "../types";
import { OrganiserPreset } from "../presets/organiserPresets";

const momentFn: any = moment;

const normalizeTypeValue = (value: unknown): string | undefined => {
	if (value === null || value === undefined) return undefined;
	const normalized = String(value).trim().toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
};

const normalizeTypeList = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value
			.map((entry) => normalizeTypeValue(entry))
			.filter((entry): entry is string => Boolean(entry));
	}
	const single = normalizeTypeValue(value);
	return single ? [single] : [];
};

const getAllowedTypes = (preset: OrganiserPreset): Set<string> => {
	const allowed = preset.typeFilter
		.map((value) => normalizeTypeValue(value))
		.filter((value): value is string => Boolean(value));
	return new Set(allowed);
};

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
		const dateId = date.format("YYYY-MM-DD");
		dayColumns.push({
			id: dateId,
			title: date.format("ddd Do MMM"),
			fieldValue: dateId,
		});
	}

	return [markedColumn, ...dayColumns];
};

export const createWeeklyOrganiserConfig = (
	weekOffset: number,
	preset: OrganiserPreset
): BoardConfig<OrganiserItem> => {
	const allowedTypes = getAllowedTypes(preset);
	const resolveType = (
		frontmatter: Record<string, unknown>
	): OrganiserItemType | undefined => {
		const typeValues = normalizeTypeList(frontmatter.type);
		const match = typeValues.find((value) => allowedTypes.has(value));
		return match ? (match as OrganiserItemType) : undefined;
	};

	return {
		id: "weekly-organiser",
		name: preset.label,
		columns: generateWeekColumns(weekOffset),
		fieldMapping: {
			field: "scheduled",
			type: "date",
			fallbackField: "date",
			defaultField: "marked",
		},
		itemFilter: {
			customFilter: (_file, frontmatter) => {
				return Boolean(resolveType(frontmatter));
			},
		},
		itemTransformer: (file, frontmatter) => {
			const resolvedType = resolveType(frontmatter) ?? "unknown";
			return {
				id: file.path,
				title: (frontmatter.title as string) || file.basename,
				path: file.path,
				type: resolvedType,
				coverImage: (frontmatter.cover ||
					frontmatter.image) as string | undefined,
				date: frontmatter.scheduled as string | undefined,
				marked: frontmatter.marked === true,
			};
		},
	};
};
