import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import CookingAssistantPlugin from "../main";
import { HealthService } from "../services/HealthService";
import { CookingHealth } from "./components/CookingHealth";

export const VIEW_TYPE_COOKING_HEALTH = "cooking-health-view";

export class CookingHealthView extends ItemView {
  private healthService: HealthService;
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: CookingAssistantPlugin) {
    super(leaf);
    this.healthService = new HealthService(
      plugin.app,
      () => plugin.settings,
      () => plugin.getLedgerEntries()
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
    this.renderView();
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }

  private renderView() {
    const container = this.contentEl;
    if (!this.root) {
      this.root = createRoot(container);
    }

    const snapshot = this.healthService.getSnapshot();
    const todoistEntries = this.plugin
      .getLedgerEntries()
      .filter((entry) => entry.key.startsWith("todoist:"))
      .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
      .slice(0, 10);

    this.root.render(
      <React.StrictMode>
        <CookingHealth
          snapshot={snapshot}
          todoistEntries={todoistEntries}
          onRefresh={() => this.renderView()}
          onScan={async () => {
            await this.plugin.inboxWatcher?.scanInbox();
            this.renderView();
          }}
          onClear={() => {
            this.plugin.clearLedger();
            this.renderView();
          }}
        />
      </React.StrictMode>
    );
  }
}