import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import type { App } from "obsidian";
import { RecipeIndexService } from "./RecipeIndexService";

const makeFile = (path: string, mtime = 0, size = 0) => {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return new TFile(path, name, extension, { mtime, size });
};

const makeApp = (
  markdownFiles: TFile[],
  frontmatterMap: Map<string, any>,
  extraFiles: TFile[] = []
) => {
  const allFiles = [...markdownFiles, ...extraFiles];
  return {
    vault: {
      getMarkdownFiles: () => markdownFiles,
      getAbstractFileByPath: (path: string) =>
        allFiles.find((file) => file.path === path) ?? null
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        frontmatter: frontmatterMap.get(file.path)
      })
    },
    fileManager: {
      processFrontMatter: async (file: TFile, callback: (fm: any) => void) => {
        const frontmatter = { ...(frontmatterMap.get(file.path) ?? {}) };
        callback(frontmatter);
        frontmatterMap.set(file.path, frontmatter);
      }
    }
  } as unknown as App;
};

describe("RecipeIndexService", () => {
  it("filters to recipes folder and resolves cover paths", () => {
    const files = [
      makeFile("cooking/recipes/alpha.md", 1, 10),
      makeFile("cooking/recipes/sub/beta.md", 2, 20),
      makeFile("cooking/notes/note.md", 3, 30)
    ];
    const frontmatter = new Map<string, any>([
      [
        "cooking/recipes/alpha.md",
        {
          title: "Alpha",
          cover: "images/alpha.webp",
          marked: "true",
          added: "2026-01-01",
          tags: ["soup", "winter"]
        }
      ],
      [
        "cooking/recipes/sub/beta.md",
        {
          cover: "beta.webp",
          tags: "vegan, quick"
        }
      ]
    ]);
    const app = makeApp(files, frontmatter, [makeFile("cooking/recipes/images/beta.webp")]);
    const service = new RecipeIndexService(app, () => ({
      geminiApiKey: "",
      recipesFolder: "cooking/recipes",
      inboxFolder: "cooking/inbox",
      archiveFolder: "cooking/inbox/archive",
      imagesFolder: "cooking/recipes/images",
      databaseSort: "added-desc",
      databaseMarkedFilter: "all",
      databaseScheduledFilter: "all",
      databaseCardMinWidth: 220,
      databaseMaxCards: 500
    }));

    const recipes = service.getRecipes({ sortBy: "title-asc" });
    expect(recipes).toHaveLength(2);
    expect(recipes[0].title).toBe("Alpha");
    expect(recipes[0].marked).toBe(true);
    expect(recipes[0].coverPath).toBe("cooking/recipes/images/alpha.webp");
    expect(recipes[1].title).toBe("beta");
    expect(recipes[1].coverPath).toBe("cooking/recipes/images/beta.webp");
    expect(recipes[1].tags).toEqual(["vegan", "quick"]);
  });

  it("sorts by added date and filters marked items", () => {
    const files = [
      makeFile("recipes/alpha.md", 1, 10),
      makeFile("recipes/beta.md", 2, 20)
    ];
    const frontmatter = new Map<string, any>([
      ["recipes/alpha.md", { added: "2026-01-02", marked: true }],
      ["recipes/beta.md", { added: "2026-01-01", marked: false }]
    ]);
    const app = makeApp(files, frontmatter);
    const service = new RecipeIndexService(app, () => ({
      geminiApiKey: "",
      recipesFolder: "recipes",
      inboxFolder: "inbox",
      archiveFolder: "inbox/archive",
      imagesFolder: "recipes/images",
      databaseSort: "added-desc",
      databaseMarkedFilter: "all",
      databaseScheduledFilter: "all",
      databaseCardMinWidth: 220,
      databaseMaxCards: 500
    }));

    const sorted = service.getRecipes({ sortBy: "added-desc" });
    expect(sorted[0].path).toBe("recipes/alpha.md");

    const markedOnly = service.getRecipes({ filter: { marked: true } });
    expect(markedOnly).toHaveLength(1);
    expect(markedOnly[0].path).toBe("recipes/alpha.md");
  });

  it("filters by tag and searches tags", () => {
    const files = [
      makeFile("recipes/alpha.md", 1, 10),
      makeFile("recipes/beta.md", 2, 20)
    ];
    const frontmatter = new Map<string, any>([
      ["recipes/alpha.md", { tags: ["soup", "winter"] }],
      ["recipes/beta.md", { tags: "salad" }]
    ]);
    const app = makeApp(files, frontmatter);
    const service = new RecipeIndexService(app, () => ({
      geminiApiKey: "",
      recipesFolder: "recipes",
      inboxFolder: "inbox",
      archiveFolder: "inbox/archive",
      imagesFolder: "recipes/images",
      databaseSort: "added-desc",
      databaseMarkedFilter: "all",
      databaseScheduledFilter: "all",
      databaseCardMinWidth: 220,
      databaseMaxCards: 500
    }));

    const filtered = service.getRecipes({ filter: { tag: "soup" } });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe("recipes/alpha.md");

    const searched = service.getRecipes({ search: "sal" });
    expect(searched).toHaveLength(1);
    expect(searched[0].path).toBe("recipes/beta.md");
  });

  it("updates marked frontmatter via setMarked", async () => {
    const files = [makeFile("recipes/alpha.md", 1, 10)];
    const frontmatter = new Map<string, any>([["recipes/alpha.md", {}]]);
    const app = makeApp(files, frontmatter);
    const service = new RecipeIndexService(app, () => ({
      geminiApiKey: "",
      recipesFolder: "recipes",
      inboxFolder: "inbox",
      archiveFolder: "inbox/archive",
      imagesFolder: "recipes/images",
      databaseSort: "added-desc",
      databaseMarkedFilter: "all",
      databaseScheduledFilter: "all",
      databaseCardMinWidth: 220,
      databaseMaxCards: 500
    }));

    await service.setMarked("recipes/alpha.md", true);
    expect(frontmatter.get("recipes/alpha.md").marked).toBe(true);

    await service.setMarked("recipes/alpha.md", false);
    expect(frontmatter.get("recipes/alpha.md").marked).toBeUndefined();
  });
});
