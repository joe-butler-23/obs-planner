import { App, normalizePath } from "obsidian";
import { CookingAssistantSettings } from "../../../settings";
import { ProcessedRecipe } from "../types";
import { InboxJob } from "../../../services/InboxWatcher";

export class DuplicateRecipeError extends Error {
  constructor(public readonly slug: string) {
    super(`Duplicate recipe slug: ${slug}`);
    this.name = "DuplicateRecipeError";
  }
}

export class RecipeWriter {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings
  ) {}

  async create(result: ProcessedRecipe, job: InboxJob): Promise<string> {
    const settings = this.getSettings();
    const recipe = result.recipe;
    const title = recipe.title?.trim() || "Captured Recipe";
    const slug = this.slugify(title);

    const recipeFolder = normalizePath(settings.recipesFolder);
    await this.ensureFolder(recipeFolder);

    const targetPath = normalizePath(`${recipeFolder}/${slug}.md`);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing) {
      throw new DuplicateRecipeError(slug);
    }

    const coverPath = await this.writeCoverImage(result, slug);
    const added = new Date().toISOString().slice(0, 10);
    const source = recipe.source || (job.type === "url" ? job.content : "");

    const frontmatter = this.buildFrontmatter({
      title,
      source,
      added,
      cover: coverPath
    });

    const body = this.buildBody(recipe, coverPath, title);
    const content = [frontmatter, "", body].join("\n");

    await this.app.vault.create(targetPath, content);
    return targetPath;
  }

  private async writeCoverImage(result: ProcessedRecipe, slug: string) {
    if (!result.imageBytes || !result.imageMimeType) return null;

    const settings = this.getSettings();
    const imagesFolder = normalizePath(settings.imagesFolder);
    await this.ensureFolder(imagesFolder);

    const webpBytes = await this.convertToWebp(result.imageBytes, result.imageMimeType);
    const fileName = `${slug}.webp`;
    const targetPath = normalizePath(`${imagesFolder}/${fileName}`);

    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (!existing) {
      await this.app.vault.createBinary(targetPath, webpBytes);
    }

    return this.coverPathForFrontmatter(imagesFolder, settings.recipesFolder, fileName);
  }

  private async convertToWebp(bytes: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
    if (typeof document === "undefined") {
      throw new Error("Image conversion requires DOM APIs");
    }

    const blob = new Blob([bytes], { type: mimeType || "image/png" });
    const image = await this.blobToImage(blob);

    // Calculate resize dimensions (800px max in any direction)
    const MAX_DIMENSION = 800;
    let width = image.width;
    let height = image.height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);

      console.debug('[RecipeWriter] Resizing image', {
        original: { width: image.width, height: image.height },
        resized: { width, height },
        scale
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to acquire canvas context for image conversion");
    }
    ctx.drawImage(image, 0, 0, width, height);

    const webpBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (output) => (output ? resolve(output) : reject(new Error("WebP conversion failed"))),
        "image/webp",
        0.9
      );
    });

    return await webpBlob.arrayBuffer();
  }

  private async blobToImage(blob: Blob): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    await image.decode();
    URL.revokeObjectURL(url);
    return image;
  }

  private coverPathForFrontmatter(imagesFolder: string, recipesFolder: string, fileName: string) {
    const normalizedImages = normalizePath(imagesFolder);
    const normalizedRecipes = normalizePath(recipesFolder);
    const imagePath = normalizePath(`${normalizedImages}/${fileName}`);

    if (imagePath.startsWith(`${normalizedRecipes}/`)) {
      return imagePath.slice(normalizedRecipes.length + 1);
    }

    return imagePath;
  }

  private buildFrontmatter(opts: {
    title: string;
    source?: string | null;
    added: string;
    cover: string | null;
  }) {
    const lines = [
      "---",
      `title: ${this.yamlString(opts.title)}`,
      "type: recipe",
      `source: ${this.yamlString(opts.source ?? "")}`,
      `added: ${opts.added}`,
      `cover: ${opts.cover ?? ""}`,
      "cooked: false",
      "marked: false",
      "scheduled:",
      "tags:",
      "---"
    ];
    return lines.join("\n");
  }

  private buildBody(recipe: ProcessedRecipe["recipe"], coverPath: string | null, title: string) {
    const ingredients = recipe.ingredients?.length
      ? recipe.ingredients.map((ing) => `- ${ing}`).join("\n")
      : "-";
    const method = recipe.method?.length
      ? recipe.method.map((step, index) => `${index + 1}. ${step}`).join("\n")
      : "1.";

    const sections: Array<string | null> = [
      `# ${title}`,
      "",
      coverPath ? `![Recipe Image](${coverPath})` : null,
      coverPath ? "" : null,
      "## Ingredients",
      ingredients,
      "",
      "## Method",
      method,
      "",
      "## Cook Log"
    ];

    return sections.filter((section) => section !== null).join("\n");
  }

  private yamlString(value: string) {
    if (!value) return "";
    return JSON.stringify(value);
  }

  private slugify(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "captured-recipe"
    );
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      await this.app.vault.createFolder(current);
    }
  }
}
