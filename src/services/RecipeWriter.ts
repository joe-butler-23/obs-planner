import { App, normalizePath } from "obsidian";
import { CookingAssistantSettings } from "../settings";
import { GeminiResult } from "./GeminiService";
import { InboxJob } from "./InboxWatcher";

export class RecipeWriter {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings
  ) {}

  async create(result: GeminiResult, job: InboxJob): Promise<string> {
    const settings = this.getSettings();
    const slug = this.slugify(result.title);
    const recipeFolder = normalizePath(settings.recipesFolder);

    await this.ensureFolder(recipeFolder);

    const targetPath = normalizePath(`${recipeFolder}/${slug}.md`);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing) {
      throw new Error(`Duplicate recipe slug: ${slug}`);
    }

    const coverPath = await this.ensureWebpCover(result.coverImagePath, slug);
    const frontmatter = this.buildFrontmatter({
      title: result.title,
      source: result.source,
      added: result.added,
      cover: coverPath,
      job
    });

    const content = [frontmatter, "", result.markdownBody].join("\n");
    await this.app.vault.create(targetPath, content);
    return targetPath;
  }

  private async ensureWebpCover(coverImagePath: string | null | undefined, slug: string) {
    if (!coverImagePath) return null;
    if (!coverImagePath.toLowerCase().endsWith(".webp")) {
      throw new Error("Non-webp cover detected. Add conversion before processing.");
    }

    // For now, assume the provided webp path is already synced into the vault (e.g., via inbox).
    // TODO: add optional copy/move into imagesFolder once conversion pipeline is wired.
    return coverImagePath;
  }

  private buildFrontmatter(opts: {
    title: string;
    source?: string | null;
    added: string;
    cover: string | null;
    job: InboxJob;
  }) {
    const lines = [
      "---",
      `title: ${opts.title}`,
      "type: recipe",
      `source: ${opts.source ?? ""}`,
      `added: ${opts.added}`,
      `cover: ${opts.cover ?? ""}`,
      "cooked: false",
      "marked: false",
      "scheduled: null",
      "tags: []",
      "---"
    ];
    return lines.join("\n");
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "captured-recipe";
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) return;
    await this.app.vault.createFolder(normalized);
  }
}
