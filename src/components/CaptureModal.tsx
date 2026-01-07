import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import CookingAssistantPlugin from "../main";

export class CaptureModal extends Modal {
  private urlValue = "";
  private isSubmitting = false;

  constructor(app: App, private readonly plugin: CookingAssistantPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText("Capture recipe");

    contentEl.createEl("p", {
      text: "Drop a URL, text snippet, or image into the inbox folder. Gemini will extract and create a recipe."
    });

    new Setting(contentEl)
      .setName("Inbox folder")
      .setDesc("Current watched inbox.")
      .addText((text) => text.setDisabled(true).setValue(this.plugin.settings.inboxFolder));

    contentEl.createEl("h3", { text: "Add URL directly" });

    const urlSetting = new Setting(contentEl)
      .setName("Recipe URL")
      .setDesc("Paste a recipe URL to create an inbox job.")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/recipe")
          .onChange((value) => {
            this.urlValue = value.trim();
          })
      );

    urlSetting.addButton((button) =>
      button
        .setButtonText("Add to inbox")
        .setCta()
        .onClick(async () => {
          await this.handleSubmit();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private looksLikeUrl(value: string) {
    return /^(https?:\/\/[^\s]+)$/i.test(value.trim());
  }

  private async handleSubmit() {
    if (this.isSubmitting) return;
    const url = this.urlValue;
    if (!url || !this.looksLikeUrl(url)) {
      new Notice("Please enter a valid URL (starting with http/https).");
      return;
    }
    this.isSubmitting = true;

    try {
      const inboxFolder = normalizePath(this.plugin.settings.inboxFolder);
      const adapter = this.app.vault.adapter;
      if (!(await adapter.exists(inboxFolder))) {
        await adapter.mkdir(inboxFolder);
      }

      const job = {
        type: "url",
        content: url,
        created_at: new Date().toISOString(),
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: "manual"
      };

      const path = normalizePath(`${inboxFolder}/${job.id}.json`);
      await this.app.vault.create(path, JSON.stringify(job, null, 2));
      new Notice("URL added to inbox.");
      this.urlValue = "";
      this.close();
    } catch (error) {
      console.error("Failed to create inbox job", error);
      new Notice("Failed to add URL. Check console for details.");
    } finally {
      this.isSubmitting = false;
    }
  }
}
