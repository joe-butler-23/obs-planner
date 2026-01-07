import { CachedMetadata, getAllTags, TFile } from "obsidian";
import { ItemFilter } from "../types/kanban-config";

export const matchesItemFilter = (
	file: TFile,
	cache: CachedMetadata | null | undefined,
	filter?: ItemFilter
): boolean => {
	if (!filter) return true;

	const frontmatter = cache?.frontmatter || {};
	const { pathPattern, requiredTags, requiredFields, customFilter } = filter;

	if (pathPattern && !pathPattern.test(file.path)) return false;

	if (requiredTags) {
		const fileTags = cache ? getAllTags(cache) ?? [] : [];
		const hasTags = requiredTags.some((tag) => fileTags.includes(tag));
		if (!hasTags) return false;
	}

	if (requiredFields) {
		const hasFields = requiredFields.every(
			(field) => frontmatter[field] !== undefined
		);
		if (!hasFields) return false;
	}

	if (customFilter && !customFilter(file, frontmatter)) return false;

	return true;
};
