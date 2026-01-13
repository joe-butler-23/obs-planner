import { App, normalizePath, TFile } from "obsidian";
import { CookingAssistantSettings } from "../../../settings";
import { CachedRecipe, RecipeIndexItem, RecipeIndexQuery, RecipeIndexSort } from "../types";
import { buildRecipeEntry } from "../utils/metadata";

export type { RecipeIndexSort, RecipeIndexFilter, RecipeIndexQuery, RecipeIndexItem } from "../types";

export class RecipeIndexService {
  private cache = new Map<string, CachedRecipe>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings
  ) {}

  getAvailableTags(): string[] {
    this.refresh();
    const tags = new Set<string>();
    for (const item of this.cache.values()) {
      item.tagsLower.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }

  refresh() {
    const settings = this.getSettings();
    const recipesFolder = normalizePath(settings.recipesFolder);
    const recipesPrefix = recipesFolder ? `${recipesFolder}/` : "";
    const files = this.app.vault.getMarkdownFiles();

    const seen = new Set<string>();

    for (const file of files) {
      if (recipesPrefix && !file.path.startsWith(recipesPrefix)) continue;
      seen.add(file.path);

      const fingerprint = `${file.stat.mtime}:${file.stat.size}`;
      const cached = this.cache.get(file.path);
      if (cached && cached.fingerprint === fingerprint) continue;

      const entry = buildRecipeEntry(file, fingerprint, this.app, settings);
      this.cache.set(file.path, entry);
    }

    for (const path of this.cache.keys()) {
      if (!seen.has(path)) {
        this.cache.delete(path);
      }
    }
  }

  getRecipes(query: RecipeIndexQuery = {}): RecipeIndexItem[] {
    return this.queryRecipes(query).items;
  }

  queryRecipes(query: RecipeIndexQuery = {}): { items: RecipeIndexItem[]; total: number } {
    this.refresh();
    const sortBy = query.sortBy ?? "added-desc";
    const needle = query.search?.trim().toLowerCase();
    const tagNeedles = query.filter?.tags
      ?.map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    let items = Array.from(this.cache.values());

    if (needle) {
      items = items.filter(
        (item) =>
          item.titleLower.includes(needle) ||
          item.tagsLower.some((tag) => tag.includes(needle))
      );
    }

    if (query.filter?.marked !== undefined) {
      items = items.filter((item) => item.marked === query.filter?.marked);
    }

    if (query.filter?.scheduled !== undefined) {
      items = items.filter(
        (item) => Boolean(item.scheduled) === query.filter?.scheduled
      );
    }

    const addedAfter = query.filter?.addedAfter;
    if (addedAfter !== undefined) {
      items = items.filter(
        (item) => item.addedTimestamp !== null && item.addedTimestamp >= addedAfter
      );
    }

    if (tagNeedles && tagNeedles.length > 0) {
      items = items.filter((item) =>
        tagNeedles.every((tag) => item.tagsLower.includes(tag))
      );
    }

    items.sort((a, b) => this.compareItems(a, b, sortBy));

    const total = items.length;
    if (query.limit && query.limit > 0) {
      items = items.slice(0, query.limit);
    }

    return {
      items: items.map(({ titleLower, fingerprint, tagsLower, ...rest }) => rest),
      total
    };
  }

  getMarkedCount(refresh = true): number {
    if (refresh) {
      this.refresh();
    }

    let count = 0;
    for (const item of this.cache.values()) {
      if (item.marked) count += 1;
    }
    return count;
  }

  async setMarked(path: string, value: boolean) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Recipe not found: ${path}`);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (value) {
        frontmatter.marked = true;
      } else {
        delete frontmatter.marked;
      }
    });
  }

  async clearAllMarked() {
    this.refresh();
    const markedItems = Array.from(this.cache.values()).filter((item) => item.marked);
    for (const item of markedItems) {
      await this.setMarked(item.path, false);
      item.marked = false;
    }
  }

  private compareItems(a: CachedRecipe, b: CachedRecipe, sortBy: RecipeIndexSort) {
    switch (sortBy) {
      case "title-asc":
        return a.title.localeCompare(b.title);
      case "title-desc":
        return b.title.localeCompare(a.title);
      case "added-asc":
        return this.compareOptionalNumber(a.addedTimestamp, b.addedTimestamp, "asc");
      case "added-desc":
        return this.compareOptionalNumber(a.addedTimestamp, b.addedTimestamp, "desc");
      case "scheduled-asc":
        return this.compareOptionalNumber(a.scheduledTimestamp, b.scheduledTimestamp, "asc");
      case "scheduled-desc":
        return this.compareOptionalNumber(a.scheduledTimestamp, b.scheduledTimestamp, "desc");
      default:
        return 0;
    }
  }

  private compareOptionalNumber(
    a: number | null,
    b: number | null,
    direction: "asc" | "desc"
  ) {
    const aValue =
      a ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bValue =
      b ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return direction === "asc" ? aValue - bValue : bValue - aValue;
  }
}
