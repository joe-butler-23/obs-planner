import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import CookingAssistantPlugin from "../main";
import { RecipeIndexService } from "../services/RecipeIndexService";

export const VIEW_TYPE_RECIPE_DATABASE = "cooking-database-view";

const formatDate = (value: string | null) => (value ? value : "");

export class CookingDatabaseView extends ItemView {
  private readonly plugin: CookingAssistantPlugin;
  private readonly index: RecipeIndexService;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CookingAssistantPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.index = new RecipeIndexService(this.app, () => this.plugin.settings);
  }

  getViewType() {
    return VIEW_TYPE_RECIPE_DATABASE;
  }

  getDisplayText() {
    return "Recipe Database";
  }

  getIcon() {
    return "layout-grid";
  }

  async onOpen() {
    this.render();

    this.registerEvent(this.app.vault.on("create", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRender()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRender()));

    this.registerInterval(window.setInterval(() => this.scheduleRender(), 60_000));
  }

  onClose() {
    this.contentEl.empty();
  }

  refresh() {
    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.render();
    }, 200);
  }

  private render() {
    const settings = this.plugin.settings;
    const filter = {
      marked:
        settings.databaseMarkedFilter === "marked"
          ? true
          : settings.databaseMarkedFilter === "unmarked"
            ? false
            : undefined,
      scheduled:
        settings.databaseScheduledFilter === "scheduled"
          ? true
          : settings.databaseScheduledFilter === "unscheduled"
            ? false
            : undefined
    };
    const allRecipes = this.index.getRecipes({
      sortBy: settings.databaseSort,
      filter
    });
    const maxCards = settings.databaseMaxCards;
    const recipes =
      maxCards && maxCards > 0 ? allRecipes.slice(0, maxCards) : allRecipes;
    const isTruncated = recipes.length < allRecipes.length;

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cooking-db");
    const minWidth = Math.max(160, settings.databaseCardMinWidth || 220);
    contentEl.style.setProperty("--cooking-db-card-min", `${minWidth}px`);

    const header = contentEl.createEl("div", { cls: "cooking-db__header" });
    header.createEl("h2", { text: "Recipe Database" });
    header.createEl("div", {
      cls: "cooking-db__count",
      text: isTruncated
        ? `${recipes.length} of ${allRecipes.length} recipes`
        : `${allRecipes.length} recipes`
    });

    const grid = contentEl.createEl("div", { cls: "cooking-db__grid" });
    if (recipes.length === 0) {
      grid.createEl("div", { cls: "cooking-db__empty", text: "No recipes found." });
      return;
    }

    const fragment = document.createDocumentFragment();
    recipes.forEach((recipe) => {
      const card = document.createElement("div");
      card.className = "cooking-db__card";
      card.dataset.path = recipe.path;
      card.tabIndex = 0;

      card.addEventListener("click", (event) => {
        void this.openRecipe(recipe.path, event.ctrlKey || event.metaKey);
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void this.openRecipe(recipe.path, event.ctrlKey || event.metaKey);
        }
      });

      const cover = document.createElement("div");
      cover.className = "cooking-db__cover";
      if (recipe.coverPath) {
        const img = document.createElement("img");
        img.src = recipe.coverPath;
        img.alt = recipe.title;
        img.loading = "lazy";
        img.decoding = "async";
        cover.appendChild(img);
      } else {
        cover.classList.add("cooking-db__cover--empty");
      }

      const body = document.createElement("div");
      body.className = "cooking-db__body";

      const title = document.createElement("div");
      title.className = "cooking-db__title";
      title.textContent = recipe.title;

      const meta = document.createElement("div");
      meta.className = "cooking-db__meta";
      const metaParts = [];
      const added = formatDate(recipe.added);
      const scheduled = formatDate(recipe.scheduled);
      if (added) metaParts.push(`Added ${added}`);
      if (scheduled) metaParts.push(`Scheduled ${scheduled}`);
      meta.textContent = metaParts.join(" | ");

      const actions = document.createElement("div");
      actions.className = "cooking-db__actions";

      const label = document.createElement("label");
      label.className = "cooking-db__toggle";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = recipe.marked;
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", async (event) => {
        event.stopPropagation();
        checkbox.disabled = true;
        try {
          await this.index.setMarked(recipe.path, checkbox.checked);
        } finally {
          checkbox.disabled = false;
          this.scheduleRender();
        }
      });
      const labelText = document.createElement("span");
      labelText.textContent = "Marked";
      label.append(checkbox, labelText);
      actions.appendChild(label);

      body.append(title, meta, actions);
      card.append(cover, body);
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  }

  private async openRecipe(path: string, forceSplit: boolean) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const isValidLeaf = (leaf: WorkspaceLeaf | null) => {
      if (!leaf) return false;
      const viewType = leaf.view?.getViewType?.();
      if (viewType === VIEW_TYPE_RECIPE_DATABASE) return false;
      const state = leaf.getViewState();
      if (state?.pinned) return false;
      return true;
    };

    let leaf: WorkspaceLeaf;
    if (forceSplit) {
      leaf = this.app.workspace.getLeaf("split", "vertical");
    } else {
      const recent = this.app.workspace.getMostRecentLeaf();
      const fallback = this.app.workspace
        .getLeavesOfType("markdown")
        .find((candidate) => isValidLeaf(candidate));
      leaf = isValidLeaf(recent)
        ? (recent as WorkspaceLeaf)
        : fallback ?? this.app.workspace.getLeaf("split", "vertical");
    }

    await leaf.openFile(file, { active: true });
  }
}
