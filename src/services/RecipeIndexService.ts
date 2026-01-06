import { App, normalizePath, TFile } from "obsidian";
import { CookingAssistantSettings } from "../settings";

export type RecipeIndexSort =
  | "title-asc"
  | "title-desc"
  | "added-asc"
  | "added-desc"
  | "scheduled-asc"
  | "scheduled-desc";

export type RecipeIndexFilter = {
  marked?: boolean;
  scheduled?: boolean;
};

export type RecipeIndexQuery = {
  sortBy?: RecipeIndexSort;
  filter?: RecipeIndexFilter;
  search?: string;
  limit?: number;
};

export type RecipeIndexItem = {
  path: string;
  title: string;
  coverPath: string | null;
  marked: boolean;
  added: string | null;
  scheduled: string | null;
  addedTimestamp: number | null;
  scheduledTimestamp: number | null;
};

type CachedRecipe = RecipeIndexItem & {
  fingerprint: string;
  titleLower: string;
};

const isTruthyMarked = (value: unknown) =>
  value === true || value === "true" || value === "yes";

const parseDateString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseDateTimestamp = (value: string | null): number | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const isRemoteUrl = (value: string) =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("data:");

export class RecipeIndexService {
  private cache = new Map<string, CachedRecipe>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings
  ) {}

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

      const entry = this.buildEntry(file, fingerprint);
      this.cache.set(file.path, entry);
    }

    for (const path of this.cache.keys()) {
      if (!seen.has(path)) {
        this.cache.delete(path);
      }
    }
  }

  getRecipes(query: RecipeIndexQuery = {}): RecipeIndexItem[] {
    this.refresh();
    const sortBy = query.sortBy ?? "added-desc";
    const needle = query.search?.trim().toLowerCase();

    let items = Array.from(this.cache.values());

    if (needle) {
      items = items.filter((item) => item.titleLower.includes(needle));
    }

    if (query.filter?.marked !== undefined) {
      items = items.filter((item) => item.marked === query.filter?.marked);
    }

    if (query.filter?.scheduled !== undefined) {
      items = items.filter(
        (item) => Boolean(item.scheduled) === query.filter?.scheduled
      );
    }

    items.sort((a, b) => this.compareItems(a, b, sortBy));

    if (query.limit && query.limit > 0) {
      items = items.slice(0, query.limit);
    }

    return items.map(({ titleLower, fingerprint, ...rest }) => rest);
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

    this.cache.delete(path);
  }

  private buildEntry(file: TFile, fingerprint: string): CachedRecipe {
    const settings = this.getSettings();
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};

    const title = String(frontmatter.title ?? file.basename).trim() || file.basename;
    const coverPath = this.resolveCoverPath(
      frontmatter.cover ?? frontmatter.image ?? "",
      file.path,
      settings
    );
    const marked = isTruthyMarked(frontmatter.marked);
    const added = parseDateString(frontmatter.added);
    const scheduled = parseDateString(frontmatter.scheduled);

    return {
      path: file.path,
      title,
      coverPath,
      marked,
      added,
      scheduled,
      addedTimestamp: parseDateTimestamp(added),
      scheduledTimestamp: parseDateTimestamp(scheduled),
      fingerprint,
      titleLower: title.toLowerCase()
    };
  }

  private resolveCoverPath(
    coverValue: unknown,
    filePath: string,
    settings: CookingAssistantSettings
  ) {
    if (!coverValue) return null;
    const cover = String(coverValue).trim();
    if (!cover) return null;
    if (isRemoteUrl(cover)) return cover;

    const normalized = normalizePath(cover.replace(/^\.\//, ""));
    const recipesFolder = normalizePath(settings.recipesFolder);
    const imagesFolder = normalizePath(settings.imagesFolder);

    if (normalized.startsWith(`${recipesFolder}/`)) return normalized;
    if (normalized.startsWith(`${imagesFolder}/`)) return normalized;

    if (normalized.startsWith("images/") && imagesFolder.startsWith(`${recipesFolder}/`)) {
      return normalizePath(`${recipesFolder}/${normalized}`);
    }

    const parent = filePath.split("/").slice(0, -1).join("/");
    return parent ? normalizePath(`${parent}/${normalized}`) : normalized;
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
