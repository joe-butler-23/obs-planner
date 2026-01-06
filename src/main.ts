import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { CaptureModal } from "./components/CaptureModal";
import { CookingAssistantSettingTab, CookingAssistantSettings, DEFAULT_SETTINGS } from "./settings";
import { GeminiService } from "./services/GeminiService";
import { InboxWatcher } from "./services/InboxWatcher";
import { RecipeWriter } from "./services/RecipeWriter";

export default class CookingAssistantPlugin extends Plugin {
  settings: CookingAssistantSettings;
  inboxWatcher: InboxWatcher | null = null;

  async onload() {
    await this.loadSettings();

    const geminiService = new GeminiService(() => this.settings.geminiApiKey);
    const recipeWriter = new RecipeWriter(this.app, () => this.settings);

    this.inboxWatcher = new InboxWatcher(this.app, () => this.settings, geminiService, recipeWriter, (message) =>
      new Notice(message)
    );

    // Event-driven inbox watcher (create/modify in inbox folder)
    this.registerEvent(this.app.vault.on("create", async (file) => this.handleFileEvent(file)));
    this.registerEvent(this.app.vault.on("modify", async (file) => this.handleFileEvent(file)));

    // Periodic fallback scan (every 5 minutes)
    this.registerInterval(window.setInterval(() => this.inboxWatcher?.scanInbox(), 5 * 60 * 1000));

    this.addSettingTab(new CookingAssistantSettingTab(this.app, this));

    this.addCommand({
      id: "capture-recipe",
      name: "Capture recipe (URL/Text/Image)",
      callback: () => new CaptureModal(this.app, this).open()
    });
  }

  async onunload() {
    // No-op: registerEvent/registerInterval are auto-cleaned by Plugin base class
  }

  private async handleFileEvent(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    await this.inboxWatcher?.handleFileEvent(file);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
