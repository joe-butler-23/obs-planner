import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import CookingAssistantPlugin from "../main";
import { RecipeIndexService, RecipeIndexSort } from "../services/RecipeIndexService";

export const VIEW_TYPE_RECIPE_DATABASE = "cooking-database-view";

const formatDate = (value: string | null) => (value ? value : "");

type MarkedFilter = "all" | "marked" | "unmarked";
type ScheduledFilter = "all" | "scheduled" | "unscheduled";

export class CookingDatabaseView extends ItemView {
  private readonly plugin: CookingAssistantPlugin;
  private readonly index: RecipeIndexService;
  private refreshTimer: number | null = null;
  private suppressRefreshUntil = 0;
  private headerCountEl: HTMLDivElement | null = null;
  private gridEl: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private tagSelect: HTMLSelectElement | null = null;
  private markedSelect: HTMLSelectElement | null = null;
  private scheduledSelect: HTMLSelectElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;
  private currentSearch = "";
  private currentTags: string[] = [];
  private currentMarkedFilter: MarkedFilter;
  private currentScheduledFilter: ScheduledFilter;
  private currentSort: RecipeIndexSort;

  constructor(leaf: WorkspaceLeaf, plugin: CookingAssistantPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.index = new RecipeIndexService(this.app, () => this.plugin.settings);
    this.currentMarkedFilter = plugin.settings.databaseMarkedFilter;
    this.currentScheduledFilter = plugin.settings.databaseScheduledFilter;
    this.currentSort = plugin.settings.databaseSort;
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
    this.buildLayout();
    this.renderList();

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

  applySettings() {
    const settings = this.plugin.settings;
    this.currentSort = settings.databaseSort;
    this.currentMarkedFilter = settings.databaseMarkedFilter;
    this.currentScheduledFilter = settings.databaseScheduledFilter;

    if (this.sortSelect) this.sortSelect.value = this.currentSort;
    if (this.markedSelect) this.markedSelect.value = this.currentMarkedFilter;
    if (this.scheduledSelect) this.scheduledSelect.value = this.currentScheduledFilter;

    this.scheduleRender();
  }

  private scheduleRender() {
    if (Date.now() < this.suppressRefreshUntil && this.currentMarkedFilter === "all") {
      return;
    }
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.renderList();
    }, 200);
  }

  private buildLayout() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cooking-db");
    const minWidth = Math.max(160, this.plugin.settings.databaseCardMinWidth || 220);
    contentEl.style.setProperty("--cooking-db-card-min", `${minWidth}px`);

    const header = contentEl.createEl("div", { cls: "cooking-db__header" });
    header.createEl("h2", { text: "Recipe Database" });
    this.headerCountEl = header.createEl("div", {
      cls: "cooking-db__count",
      text: "0 recipes"
    });

    const controls = contentEl.createEl("div", { cls: "cooking-db__controls" });
    const plannerButton = controls.createEl("button", {
      cls: "cooking-db__icon-button",
      attr: { type: "button", "aria-label": "Open Cooking Planner" }
    });
    setIcon(plannerButton, "calendar-days");
    plannerButton.addEventListener("click", () => {
      void this.plugin.openCookingPlannerView();
    });

    this.searchInput = controls.createEl("input", {
      cls: "cooking-db__search",
      attr: { type: "search", placeholder: "Search recipes..." }
    });
    this.searchInput.addEventListener("input", () => {
      this.currentSearch = this.searchInput?.value.trim() ?? "";
      this.scheduleRender();
    });

    this.sortSelect = controls.createEl("select", { cls: "cooking-db__select" });
    this.addOptions(this.sortSelect, {
      "added-desc": "Added (newest)",
      "added-asc": "Added (oldest)",
      "title-asc": "Title (A-Z)",
      "title-desc": "Title (Z-A)",
      "scheduled-desc": "Scheduled (latest)",
      "scheduled-asc": "Scheduled (oldest)"
    });
    this.sortSelect.value = this.currentSort;
    this.sortSelect.addEventListener("change", () => {
      this.currentSort =
        (this.sortSelect?.value as RecipeIndexSort) ?? this.plugin.settings.databaseSort;
      this.scheduleRender();
    });

    this.tagSelect = controls.createEl("select", {
      cls: "cooking-db__select cooking-db__select--tags",
      attr: { multiple: "true" }
    });
    this.tagSelect.size = 1;
    this.tagSelect.addEventListener("change", () => {
      if (!this.tagSelect) return;
      const selected = Array.from(this.tagSelect.selectedOptions).map(
        (option) => option.value
      );
      if (selected.includes("all")) {
        this.currentTags = [];
        Array.from(this.tagSelect.options).forEach((option) => {
          option.selected = option.value === "all";
        });
      } else {
        this.currentTags = selected.filter(Boolean);
        if (this.currentTags.length === 0) {
          Array.from(this.tagSelect.options).forEach((option) => {
            option.selected = option.value === "all";
          });
        }
      }
      this.scheduleRender();
    });

    this.markedSelect = controls.createEl("select", { cls: "cooking-db__select" });
    this.addOptions(this.markedSelect, {
      all: "All marked",
      marked: "Marked only",
      unmarked: "Unmarked only"
    });
    this.markedSelect.value = this.currentMarkedFilter;
    this.markedSelect.addEventListener("change", () => {
      const value = this.markedSelect?.value as MarkedFilter;
      this.currentMarkedFilter = value ?? "all";
      this.scheduleRender();
    });

    this.scheduledSelect = controls.createEl("select", { cls: "cooking-db__select" });
    this.addOptions(this.scheduledSelect, {
      all: "All scheduled",
      scheduled: "Scheduled only",
      unscheduled: "Unscheduled only"
    });
    this.scheduledSelect.value = this.currentScheduledFilter;
    this.scheduledSelect.addEventListener("change", () => {
      const value = this.scheduledSelect?.value as ScheduledFilter;
      this.currentScheduledFilter = value ?? "all";
      this.scheduleRender();
    });

    this.gridEl = contentEl.createEl("div", { cls: "cooking-db__grid" });
  }

  private renderList() {
    if (!this.gridEl || !this.headerCountEl) return;

    const settings = this.plugin.settings;
    const filter = {
      marked:
        this.currentMarkedFilter === "marked"
          ? true
          : this.currentMarkedFilter === "unmarked"
            ? false
            : undefined,
      scheduled:
        this.currentScheduledFilter === "scheduled"
          ? true
          : this.currentScheduledFilter === "unscheduled"
            ? false
            : undefined,
      tags: this.currentTags.length > 0 ? this.currentTags : undefined
    };

    const { items: recipes, total } = this.index.queryRecipes({
      sortBy: this.currentSort,
      filter,
      search: this.currentSearch,
      limit: settings.databaseMaxCards
    });

    const isTruncated = recipes.length < total;
    this.headerCountEl.textContent = isTruncated
      ? `${recipes.length} of ${total} recipes`
      : `${total} recipes`;

    const tags = this.index.getAvailableTags();
    this.updateTagOptions(tags);

    const minWidth = Math.max(160, settings.databaseCardMinWidth || 220);
    this.contentEl.style.setProperty("--cooking-db-card-min", `${minWidth}px`);

    const scrollTop = this.contentEl.scrollTop;

    if (recipes.length === 0) {
      this.gridEl.replaceChildren(this.createEmpty("No recipes found."));
      this.contentEl.scrollTop = scrollTop;
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
      const resolvedCover = this.resolveImagePath(recipe.coverPath, recipe.path);
      if (resolvedCover) {
        const img = document.createElement("img");
        img.src = resolvedCover;
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
        if (this.currentMarkedFilter === "all") {
          this.suppressRefreshUntil = Date.now() + 750;
        }
        try {
          await this.index.setMarked(recipe.path, checkbox.checked);
        } finally {
          checkbox.disabled = false;
          if (this.currentMarkedFilter !== "all") {
            this.scheduleRender();
          }
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

    this.gridEl.replaceChildren(fragment);
    this.contentEl.scrollTop = scrollTop;
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

  private resolveImagePath(coverPath: string | null, sourcePath: string) {
    if (!coverPath) return null;
    if (
      coverPath.startsWith("http://") ||
      coverPath.startsWith("https://") ||
      coverPath.startsWith("data:")
    ) {
      return coverPath;
    }

    const file = this.app.vault.getAbstractFileByPath(coverPath);
    if (file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }

    const resolved = this.app.metadataCache.getFirstLinkpathDest(coverPath, sourcePath);
    if (resolved instanceof TFile) {
      return this.app.vault.getResourcePath(resolved);
    }

    return null;
  }

  private addOptions(select: HTMLSelectElement, options: Record<string, string>) {
    select.replaceChildren();
    Object.entries(options).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
  }

  private updateTagOptions(tags: string[]) {
    if (!this.tagSelect) return;
    const previous = this.currentTags.filter((tag) => tags.includes(tag));
    this.tagSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All tags";
    this.tagSelect.appendChild(allOption);
    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      option.selected = previous.includes(tag);
      this.tagSelect?.appendChild(option);
    });
    if (previous.length === 0) {
      allOption.selected = true;
    }
    this.currentTags = previous;
  }

  private createEmpty(message: string) {
    const empty = document.createElement("div");
    empty.className = "cooking-db__empty";
    empty.textContent = message;
    return empty;
  }
}
