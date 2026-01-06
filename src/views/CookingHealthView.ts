import { ItemView, WorkspaceLeaf } from "obsidian";
import CookingAssistantPlugin from "../main";
import { HealthService } from "../services/HealthService";

export const VIEW_TYPE_COOKING_HEALTH = "cooking-health-view";

const formatTimestamp = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export class CookingHealthView extends ItemView {
  private readonly plugin: CookingAssistantPlugin;
  private readonly healthService: HealthService;

  constructor(leaf: WorkspaceLeaf, plugin: CookingAssistantPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.healthService = new HealthService(
      this.app,
      () => this.plugin.settings,
      () => this.plugin.getLedgerEntries()
    );
  }

  getViewType() {
    return VIEW_TYPE_COOKING_HEALTH;
  }

  getDisplayText() {
    return "Cooking Health";
  }

  getIcon() {
    return "activity";
  }

  async onOpen() {
    this.render();

    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));

    this.registerInterval(window.setInterval(() => this.render(), 30_000));
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const snapshot = this.healthService.getSnapshot();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cooking-health");

    const header = contentEl.createEl("div", { cls: "cooking-health__header" });
    header.createEl("h2", { text: "Cooking Health" });

    const controls = header.createEl("div", { cls: "cooking-health__controls" });
    const refreshButton = controls.createEl("button", { text: "Refresh" });
    refreshButton.addEventListener("click", () => this.render());

    const scanButton = controls.createEl("button", { text: "Scan inbox now" });
    scanButton.addEventListener("click", () => {
      void this.plugin.inboxWatcher?.scanInbox();
      this.render();
    });

    const summary = contentEl.createEl("div", { cls: "cooking-health__summary" });
    const pending = summary.createEl("div", { cls: "cooking-health__metric" });
    pending.createEl("div", { cls: "cooking-health__metric-label", text: "Pending" });
    pending.createEl("div", {
      cls: "cooking-health__metric-value",
      text: String(snapshot.inboxPending)
    });

    const archive = summary.createEl("div", { cls: "cooking-health__metric" });
    archive.createEl("div", { cls: "cooking-health__metric-label", text: "Archive" });
    archive.createEl("div", {
      cls: "cooking-health__metric-value",
      text: String(snapshot.archiveTotal)
    });

    const errors = summary.createEl("div", { cls: "cooking-health__metric" });
    errors.createEl("div", { cls: "cooking-health__metric-label", text: "Errors" });
    errors.createEl("div", {
      cls: "cooking-health__metric-value",
      text: String(snapshot.errorTotal)
    });

    const lastProcessed = summary.createEl("div", { cls: "cooking-health__metric" });
    lastProcessed.createEl("div", {
      cls: "cooking-health__metric-label",
      text: "Last processed"
    });
    lastProcessed.createEl("div", {
      cls: "cooking-health__metric-value",
      text: formatTimestamp(snapshot.lastProcessedAt)
    });

    const ledgerSummary = contentEl.createEl("div", { cls: "cooking-health__ledger-summary" });
    ledgerSummary.setText(
      `Ledger: ${snapshot.ledgerCounts.success} success, ${snapshot.ledgerCounts.error} error, ${snapshot.ledgerCounts.skipped} skipped`
    );

    const ledgerContainer = contentEl.createEl("div", { cls: "cooking-health__ledger" });
    ledgerContainer.createEl("h3", { text: "Recent activity" });

    if (snapshot.recentEntries.length === 0) {
      ledgerContainer.createEl("div", {
        cls: "cooking-health__empty",
        text: "No recent activity."
      });
    } else {
      const list = ledgerContainer.createEl("div", { cls: "cooking-health__ledger-list" });
      snapshot.recentEntries.forEach((entry) => {
        const row = list.createEl("div", {
          cls: `cooking-health__ledger-row cooking-health__ledger-row--${entry.status}`
        });
        row.createEl("div", { cls: "cooking-health__ledger-status", text: entry.status });
        row.createEl("div", {
          cls: "cooking-health__ledger-detail",
          text: entry.detail ?? entry.key
        });
        row.createEl("div", {
          cls: "cooking-health__ledger-time",
          text: formatTimestamp(entry.processedAt)
        });
      });
    }

    const todoistEntries = this.plugin
      .getLedgerEntries()
      .filter((entry) => entry.key.startsWith("todoist:"))
      .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
      .slice(0, 10);

    const todoistContainer = contentEl.createEl("div", {
      cls: "cooking-health__todoist"
    });
    todoistContainer.createEl("h3", { text: "Todoist activity" });

    if (todoistEntries.length === 0) {
      todoistContainer.createEl("div", {
        cls: "cooking-health__empty",
        text: "No Todoist activity yet."
      });
      return;
    }

    const todoistList = todoistContainer.createEl("div", {
      cls: "cooking-health__ledger-list"
    });
    todoistEntries.forEach((entry) => {
      const row = todoistList.createEl("div", {
        cls: `cooking-health__ledger-row cooking-health__ledger-row--${entry.status}`
      });
      row.createEl("div", { cls: "cooking-health__ledger-status", text: entry.status });
      row.createEl("div", {
        cls: "cooking-health__ledger-detail",
        text: entry.detail ?? entry.key
      });
      row.createEl("div", {
        cls: "cooking-health__ledger-time",
        text: formatTimestamp(entry.processedAt)
      });
    });
  }
}
