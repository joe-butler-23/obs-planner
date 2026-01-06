import { Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { CaptureModal } from "./components/CaptureModal";
import { CookingAssistantSettingTab, CookingAssistantSettings, DEFAULT_SETTINGS } from "./settings";
import { GeminiService } from "./services/GeminiService";
import { InboxWatcher } from "./services/InboxWatcher";
import { LedgerEntry, LedgerStore } from "./services/LedgerStore";
import { RecipeWriter } from "./services/RecipeWriter";
import { VIEW_TYPE_WEEKLY_ORGANISER, WeeklyOrganiserView } from "../organiser/src/view";

interface CookingAssistantData {
  settings: CookingAssistantSettings;
  ledger: LedgerEntry[];
}

export default class CookingAssistantPlugin extends Plugin {
  settings: CookingAssistantSettings = DEFAULT_SETTINGS;
  private ledger: LedgerStore | null = null;
  inboxWatcher: InboxWatcher | null = null;

  async onload() {
    await this.loadPluginData();

    const geminiService = new GeminiService(() => this.settings.geminiApiKey);
    const recipeWriter = new RecipeWriter(this.app, () => this.settings);

    const ledger = this.ledger;
    if (!ledger) {
      throw new Error("Ledger failed to initialize");
    }

    this.inboxWatcher = new InboxWatcher(
      this.app,
      () => this.settings,
      geminiService,
      recipeWriter,
      ledger,
      (message) => new Notice(message)
    );

    this.registerView(
      VIEW_TYPE_WEEKLY_ORGANISER,
      (leaf) => new WeeklyOrganiserView(leaf)
    );

    this.addRibbonIcon("calendar-days", "Weekly Organiser", () => {
      this.activateWeeklyOrganiserView();
    });

    this.addCommand({
      id: "open-weekly-organiser",
      name: "Open Weekly Organiser",
      callback: () => {
        this.activateWeeklyOrganiserView();
      }
    });

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
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_WEEKLY_ORGANISER);
  }

  private async handleFileEvent(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    await this.inboxWatcher?.handleFileEvent(file);
  }

  private async loadPluginData() {
    const raw = (await this.loadData()) as Partial<CookingAssistantData> | null;
    let settings: CookingAssistantSettings;
    let ledger: LedgerEntry[];

    if (raw && typeof raw === "object" && "settings" in raw) {
      settings = Object.assign({}, DEFAULT_SETTINGS, (raw as CookingAssistantData).settings);
      ledger = (raw as CookingAssistantData).ledger ?? [];
    } else {
      settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
      ledger = [];
    }

    this.settings = settings;
    this.ledger = new LedgerStore(ledger, async (entries) => this.savePluginData(entries));
  }

  private async savePluginData(ledgerOverride?: LedgerEntry[]) {
    const payload: CookingAssistantData = {
      settings: this.settings,
      ledger: ledgerOverride ?? this.ledger?.serialize() ?? []
    };
    await this.saveData(payload);
  }

  async saveSettings() {
    await this.savePluginData();
  }

  private async activateWeeklyOrganiserView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_ORGANISER);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_WEEKLY_ORGANISER,
        active: true
      });
    }

    workspace.revealLeaf(leaf);
  }
}
