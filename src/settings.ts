import { App, PluginSettingTab, Setting } from "obsidian";
import CookingAssistantPlugin from "./main";

export interface CookingAssistantSettings {
  geminiApiKey: string;
  recipesFolder: string;
  inboxFolder: string;
  archiveFolder: string;
  imagesFolder: string;
}

export const DEFAULT_SETTINGS: CookingAssistantSettings = {
  geminiApiKey: "",
  recipesFolder: "recipes",
  inboxFolder: "inbox",
  archiveFolder: "inbox/archive",
  imagesFolder: "recipes/images"
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
  }
}
