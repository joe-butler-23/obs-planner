import { App, PluginSettingTab, Setting } from "obsidian";
import CookingAssistantPlugin from "./main";
import type { RecipeIndexSort } from "./services/RecipeIndexService";

export interface CookingAssistantSettings {
  geminiApiKey: string;
  recipesFolder: string;
  inboxFolder: string;
  archiveFolder: string;
  imagesFolder: string;
  todoistLabelerMode: "gemini" | "deterministic";
  databaseSort: RecipeIndexSort;
  databaseMarkedFilter: "all" | "marked" | "unmarked";
  databaseScheduledFilter: "all" | "scheduled" | "unscheduled";
  databaseCardMinWidth: number;
  databaseMaxCards: number;
}

export const DEFAULT_SETTINGS: CookingAssistantSettings = {
  geminiApiKey: "",
  recipesFolder: "recipes",
  inboxFolder: "inbox",
  archiveFolder: "inbox/archive",
  imagesFolder: "recipes/images",
  todoistLabelerMode: "gemini",
  databaseSort: "added-desc",
  databaseMarkedFilter: "all",
  databaseScheduledFilter: "all",
  databaseCardMinWidth: 220,
  databaseMaxCards: 500
};

export class CookingAssistantSettingTab extends PluginSettingTab {
  plugin: CookingAssistantPlugin;

  constructor(app: App, plugin: CookingAssistantPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Cooking Assistant Settings" });

    new Setting(containerEl)
      .setName("Gemini API Key")
      .setDesc("Stored locally. Required for AI processing.")
      .addText((text) =>
        text
          .setPlaceholder("Gemini API Key")
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recipes folder")
      .setDesc("Path relative to vault root.")
      .addText((text) =>
        text.setValue(this.plugin.settings.recipesFolder).onChange(async (value) => {
          this.plugin.settings.recipesFolder = value.trim() || DEFAULT_SETTINGS.recipesFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Images folder")
      .setDesc("Path relative to vault root. Covers stored as .webp.")
      .addText((text) =>
        text.setValue(this.plugin.settings.imagesFolder).onChange(async (value) => {
          this.plugin.settings.imagesFolder = value.trim() || DEFAULT_SETTINGS.imagesFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Inbox folder")
      .setDesc("Folder to watch for capture jobs.")
      .addText((text) =>
        text.setValue(this.plugin.settings.inboxFolder).onChange(async (value) => {
          this.plugin.settings.inboxFolder = value.trim() || DEFAULT_SETTINGS.inboxFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Archive folder")
      .setDesc("Destination for processed jobs.")
      .addText((text) =>
        text.setValue(this.plugin.settings.archiveFolder).onChange(async (value) => {
          this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Todoist" });

    new Setting(containerEl)
      .setName("Labeler mode")
      .setDesc("Gemini builds the full shopping list using gemini-flash-latest. Deterministic uses built-in rules.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            gemini: "Gemini only",
            deterministic: "Deterministic only"
          })
          .setValue(this.plugin.settings.todoistLabelerMode)
          .onChange(async (value) => {
            this.plugin.settings.todoistLabelerMode = value as "gemini" | "deterministic";
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h3", { text: "Recipe Database" });

    new Setting(containerEl)
      .setName("Sort order")
      .setDesc("Default sort order for the Recipe Database view.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            "added-desc": "Added (newest first)",
            "added-asc": "Added (oldest first)",
            "title-asc": "Title (A-Z)",
            "title-desc": "Title (Z-A)",
            "scheduled-desc": "Scheduled (latest first)",
            "scheduled-asc": "Scheduled (oldest first)"
          })
          .setValue(this.plugin.settings.databaseSort)
          .onChange(async (value) => {
            this.plugin.settings.databaseSort = value as RecipeIndexSort;
            await this.plugin.saveSettings();
            this.plugin.refreshRecipeDatabaseView();
          });
      });

    new Setting(containerEl)
      .setName("Marked filter")
      .setDesc("Filter recipes by marked status.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            all: "All recipes",
            marked: "Marked only",
            unmarked: "Unmarked only"
          })
          .setValue(this.plugin.settings.databaseMarkedFilter)
          .onChange(async (value) => {
            this.plugin.settings.databaseMarkedFilter = value as
              | "all"
              | "marked"
              | "unmarked";
            await this.plugin.saveSettings();
            this.plugin.refreshRecipeDatabaseView();
          });
      });

    new Setting(containerEl)
      .setName("Scheduled filter")
      .setDesc("Filter recipes by scheduled status.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            all: "All recipes",
            scheduled: "Scheduled only",
            unscheduled: "Unscheduled only"
          })
          .setValue(this.plugin.settings.databaseScheduledFilter)
          .onChange(async (value) => {
            this.plugin.settings.databaseScheduledFilter = value as
              | "all"
              | "scheduled"
              | "unscheduled";
            await this.plugin.saveSettings();
            this.plugin.refreshRecipeDatabaseView();
          });
      });

    new Setting(containerEl)
      .setName("Card minimum width")
      .setDesc("Minimum width for recipe cards in the database grid (pixels).")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.databaseCardMinWidth))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.databaseCardMinWidth = Number.isFinite(parsed)
              ? Math.max(160, parsed)
              : DEFAULT_SETTINGS.databaseCardMinWidth;
            await this.plugin.saveSettings();
            this.plugin.refreshRecipeDatabaseView();
          })
      );

    new Setting(containerEl)
      .setName("Max cards")
      .setDesc("Limit cards rendered for performance. Use 0 for no limit.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.databaseMaxCards))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.databaseMaxCards = Number.isFinite(parsed)
              ? Math.max(0, parsed)
              : DEFAULT_SETTINGS.databaseMaxCards;
            await this.plugin.saveSettings();
            this.plugin.refreshRecipeDatabaseView();
          })
      );
  }
}
