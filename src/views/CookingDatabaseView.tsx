import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import CookingAssistantPlugin from "../main";
import { RecipeIndexService, RecipeIndexSort } from "../modules/cooking/services/RecipeIndexService";
import {
  CookingDatabase,
  DatabaseState,
  MarkedFilter,
  ScheduledFilter,
  AddedFilter
} from "./components/CookingDatabase";

export const VIEW_TYPE_RECIPE_DATABASE = "cooking-database-view";

export class CookingDatabaseView extends ItemView {
  private readonly index: RecipeIndexService;
  private root: Root | null = null;
  private refreshTimer: number | null = null;
  private suppressRefreshUntil = 0;
  private currentState: DatabaseState;

  constructor(leaf: WorkspaceLeaf, private plugin: CookingAssistantPlugin) {
    super(leaf);
    this.index = new RecipeIndexService(this.app, () => this.plugin.settings);
    this.currentState = {
      search: "",
      sort: plugin.settings.databaseSort,
      marked: plugin.settings.databaseMarkedFilter as MarkedFilter,
      scheduled: plugin.settings.databaseScheduledFilter as ScheduledFilter,
      added: "all",
      tags: []
    };
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
    this.scheduleRender();

    this.registerEvent(this.app.vault.on("create", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRender()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRender()));

    this.registerInterval(window.setInterval(() => this.scheduleRender(), 60_000));
  }

  onClose() {
    this.root?.unmount();
    this.root = null;
  }

  refresh() {
    this.scheduleRender();
  }

  applySettings() {
    const settings = this.plugin.settings;
    this.currentState = {
      ...this.currentState,
      sort: settings.databaseSort,
      marked: settings.databaseMarkedFilter as MarkedFilter,
      scheduled: settings.databaseScheduledFilter as ScheduledFilter
    };
    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.renderView();
    }, 200);
  }

  private renderView() {
    const container = this.contentEl;
    if (!this.root) {
      this.root = createRoot(container);
    }

    const settings = this.plugin.settings;
    const addedAfter =
      this.currentState.added === "last-7-days"
        ? (() => {
            const since = new Date();
            since.setDate(since.getDate() - 7);
            since.setHours(0, 0, 0, 0);
            return since.getTime();
          })()
        : undefined;

    const filter = {
      marked:
        this.currentState.marked === "marked"
          ? true
          : this.currentState.marked === "unmarked"
            ? false
            : undefined,
      scheduled:
        this.currentState.scheduled === "scheduled"
          ? true
          : this.currentState.scheduled === "unscheduled"
            ? false
            : undefined,
      tags: this.currentState.tags.length > 0 ? this.currentState.tags : undefined,
      addedAfter
    };

    const { items: recipes, total } = this.index.queryRecipes({
      sortBy: this.currentState.sort,
      filter,
      search: this.currentState.search,
      limit: settings.databaseMaxCards
    });
    const markedCount = this.index.getMarkedCount(false);

    const tags = this.index.getAvailableTags();

    this.root.render(
      <React.StrictMode>
        <CookingDatabase
          recipes={recipes}
          totalCount={total}
          markedCount={markedCount}
          availableTags={tags}
          settings={settings}
          state={this.currentState}
          onStateChange={(newState) => {
            this.currentState = newState;
            this.scheduleRender();
          }}
          onOpenRecipe={(path, split) => this.openRecipe(path, split)}
          onToggleMarked={async (path, marked) => {
            await this.index.setMarked(path, marked);
            this.scheduleRender();
          }}
          onClearMarked={async () => {
            await this.index.clearAllMarked();
            this.scheduleRender();
          }}
          onOpenPlanner={() => void this.plugin.openCookingPlannerView()}
          resolveCover={(coverPath, sourcePath) => this.resolveImagePath(coverPath, sourcePath)}
        />
      </React.StrictMode>
    );
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
}
