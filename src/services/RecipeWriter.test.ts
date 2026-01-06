import { describe, expect, it } from "vitest";
import { RecipeWriter } from "./RecipeWriter";
import type { ProcessedRecipe } from "../types";
import type { InboxJob } from "./InboxWatcher";
import type { App } from "obsidian";

const makeApp = () => {
  const files = new Map<string, string | ArrayBuffer>();
  const folders = new Set<string>();

  const vault = {
    getAbstractFileByPath: (path: string) => {
      if (files.has(path) || folders.has(path)) return { path };
      return null;
    },
    create: async (path: string, content: string) => {
      files.set(path, content);
      return { path };
    },
    createBinary: async (path: string, content: ArrayBuffer) => {
      files.set(path, content);
      return { path };
    },
    createFolder: async (path: string) => {
      folders.add(path);
      return { path };
    }
  };

  return {
    app: { vault } as unknown as App,
    files,
    folders
  };
};

describe("RecipeWriter", () => {
  it("writes recipe markdown with frontmatter and sections", async () => {
    const { app, files } = makeApp();
    const settings = {
      geminiApiKey: "",
      recipesFolder: "recipes",
      inboxFolder: "inbox",
      archiveFolder: "inbox/archive",
      imagesFolder: "recipes/images"
    };

    const writer = new RecipeWriter(app, () => settings);
    const processed: ProcessedRecipe = {
      recipe: {
        title: "Test Recipe",
        ingredients: ["2 eggs"],
        method: ["Cook the eggs"]
      }
    };
    const job: InboxJob = {
      type: "text",
      content: "some text"
    };

    const path = await writer.create(processed, job);
    expect(path).toBe("recipes/test-recipe.md");

    const content = files.get(path) as string;
    expect(content).toContain("type: recipe");
    expect(content).toContain("scheduled:");
    expect(content).toContain("tags:");
    expect(content).toContain("# Test Recipe");
    expect(content).toContain("## Ingredients");
    expect(content).toContain("- 2 eggs");
    expect(content).toContain("## Method");
    expect(content).toContain("1. Cook the eggs");
  });
});
