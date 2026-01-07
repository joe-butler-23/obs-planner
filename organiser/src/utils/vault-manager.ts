import { App, TFile, getAllTags, moment } from "obsidian";
import { OrganiserItem } from "../types";

const normalizeFrontmatterDate = (value: unknown): string | undefined => {
	if (!value) return undefined;
	const momentFn: any = moment;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
		const parsed = momentFn(trimmed);
		return parsed.isValid() ? parsed.format("YYYY-MM-DD") : trimmed;
	}
	if (value instanceof Date) {
		return momentFn(value).format("YYYY-MM-DD");
	}
	if (
		typeof value === "object" &&
		typeof (value as { format?: (format: string) => string }).format ===
			"function"
	) {
		return (value as { format: (format: string) => string }).format(
			"YYYY-MM-DD"
		);
	}
	return String(value);
};

export class VaultManager {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	getOrganiserItems(): OrganiserItem[] {
		const files = this.app.vault.getMarkdownFiles();
		const items: OrganiserItem[] = [];

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const frontmatter = cache.frontmatter || {};
			const tags = getAllTags(cache) || [];

			const isRecipe = file.path.includes("recipe") || tags.includes("#recipe");
			const isExercise =
				file.path.includes("exercise") || tags.includes("#exercise");
			const isMarked =
				frontmatter.marked === true ||
				frontmatter.marked === "yes" ||
				frontmatter.marked === "true";

			if (isRecipe || isExercise) {
				const normalizedDate = normalizeFrontmatterDate(
					frontmatter.scheduled ?? frontmatter.date
				);
				items.push({
					id: file.path,
					title: frontmatter.title || file.basename,
					path: file.path,
					type: isRecipe ? "recipe" : "exercise",
					coverImage: frontmatter.cover || frontmatter.image,
					date: normalizedDate, // Read from scheduled, fallback to date
					marked: isMarked,
				});
			}
		}

		return items;
	}

	async updateItemFields(
		file: TFile,
		fields: { scheduled?: string | null; marked?: boolean | null }
	) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if ("scheduled" in fields) {
				if (fields.scheduled) {
					frontmatter.scheduled = fields.scheduled;
					delete frontmatter.date; // Clean up legacy 'date' property
				} else {
					delete frontmatter.scheduled;
					// Note: We don't delete 'date' here if we are clearing scheduled, 
					// unless we want to strictly enforce the new schema. 
					// Let's clean it up to be safe and avoid confusion.
					delete frontmatter.date;
				}
			}

			if ("marked" in fields) {
				if (fields.marked) {
					frontmatter.marked = true;
				} else {
					delete frontmatter.marked;
				}
			}
		});
	}

	async updateItemDate(file: TFile, scheduled: string | null) {
		await this.updateItemFields(file, { scheduled });
	}
}
