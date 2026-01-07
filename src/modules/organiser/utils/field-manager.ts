import { App, TFile, moment } from "obsidian";
import {
	FieldMapping,
	FieldType,
	ColumnDefinition,
} from "../types/kanban-config";

// Type cast for moment (Obsidian re-exports it)
const momentFn: any = moment;

/**
 * Normalizes a frontmatter value based on field type
 */
export const normalizeFieldValue = (
	value: unknown,
	type: FieldType,
	options?: { dateFormat?: string }
): string | boolean | number | undefined => {
	if (value === null || value === undefined) return undefined;

	switch (type) {
		case "date": {
			const format = options?.dateFormat ?? "YYYY-MM-DD";

			if (typeof value === "string") {
				const trimmed = value.trim();
				// Already in target format
				if (
					/^\d{4}-\d{2}-\d{2}$/.test(trimmed) &&
					format === "YYYY-MM-DD"
				) {
					return trimmed;
				}
				const parsed = momentFn(trimmed);
				return parsed.isValid() ? parsed.format(format) : trimmed;
			}
			if (value instanceof Date) {
				return momentFn(value).format(format);
			}
			// Handle moment objects
			if (
				typeof value === "object" &&
				typeof (value as { format?: (f: string) => string }).format ===
					"function"
			) {
				return (value as { format: (f: string) => string }).format(
					format
				);
			}
			return String(value);
		}

		case "boolean": {
			if (typeof value === "boolean") return value;
			if (value === "true" || value === "yes" || value === 1) return true;
			if (value === "false" || value === "no" || value === 0)
				return false;
			return Boolean(value);
		}

		case "enum":
		case "string":
		default:
			return String(value).trim();
	}
};

/**
 * Reads a field value from frontmatter with fallback support
 */
export const readFieldValue = (
	frontmatter: Record<string, unknown>,
	mapping: FieldMapping
): string | boolean | number | undefined => {
	let rawValue = frontmatter[mapping.field];

	// Try fallback field if primary is empty
	if (
		(rawValue === undefined || rawValue === null) &&
		mapping.fallbackField
	) {
		rawValue = frontmatter[mapping.fallbackField];
	}

	return normalizeFieldValue(rawValue, mapping.type, {
		dateFormat: mapping.dateFormat,
	});
};

/**
 * Determines which column an item belongs to based on its frontmatter.
 * Returns undefined if the item doesn't belong to any column.
 */
export interface ColumnLookup {
	valueToColumnId: Map<string | boolean | number, string>;
	defaultColumnId?: string;
}

export const createColumnLookup = (
	columns: ColumnDefinition[]
): ColumnLookup => {
	const valueToColumnId = new Map<string | boolean | number, string>();
	let defaultColumnId: string | undefined;

	for (const column of columns) {
		if (column.isDefault) {
			defaultColumnId = column.id;
		}
		if (column.fieldValue !== undefined) {
			valueToColumnId.set(column.fieldValue, column.id);
		}
	}

	return { valueToColumnId, defaultColumnId };
};

export const getItemColumn = (
	frontmatter: Record<string, unknown>,
	columns: ColumnDefinition[],
	mapping: FieldMapping,
	lookup?: ColumnLookup
): string | undefined => {
	const fieldValue = readFieldValue(frontmatter, mapping);

	// First, check if the field value matches any specific column
	if (fieldValue !== undefined) {
		const matchedColumn = lookup?.valueToColumnId.get(fieldValue);
		if (matchedColumn) return matchedColumn;

		for (const column of columns) {
			if (column.fieldValue === fieldValue) {
				return column.id;
			}
		}
	}

	// If no field value match, check if item belongs to default column
	// (e.g., marked=true with no scheduled date)
	if (mapping.defaultField) {
		const defaultValue = frontmatter[mapping.defaultField];
		const isDefault =
			defaultValue === true ||
			defaultValue === "true" ||
			defaultValue === "yes";

		if (isDefault && fieldValue === undefined) {
			const defaultColumnId =
				lookup?.defaultColumnId ??
				columns.find((c) => c.isDefault)?.id;
			if (defaultColumnId) return defaultColumnId;
		}
	}

	// Item doesn't belong to any column in the current view
	return undefined;
};

/**
 * Generic field manager for reading and writing frontmatter fields
 */
export class FieldManager {
	constructor(private app: App) {}

	/**
	 * Updates frontmatter fields based on column transfer
	 */
	async updateFieldForColumn(
		file: TFile,
		targetColumn: ColumnDefinition,
		mapping: FieldMapping
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (targetColumn.isDefault) {
				// Moving to default column - clear the field
				delete frontmatter[mapping.field];
				if (mapping.fallbackField) {
					delete frontmatter[mapping.fallbackField];
				}
				// Set default field if configured
				if (mapping.defaultField) {
					frontmatter[mapping.defaultField] = true;
				}
			} else {
				// Moving to specific column - set the field value
				frontmatter[mapping.field] = targetColumn.fieldValue;
				// Clear fallback field to avoid confusion
				if (mapping.fallbackField) {
					delete frontmatter[mapping.fallbackField];
				}
				// Clear default field if configured
				if (mapping.defaultField) {
					delete frontmatter[mapping.defaultField];
				}
			}
		});
	}

	/**
	 * Read a single field value from a file
	 */
	async readField(
		file: TFile,
		mapping: FieldMapping
	): Promise<string | boolean | number | undefined> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return undefined;
		return readFieldValue(cache.frontmatter, mapping);
	}
}
