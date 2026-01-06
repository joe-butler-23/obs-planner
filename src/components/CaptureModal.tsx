import { App, Modal, Setting } from "obsidian";
import CookingAssistantPlugin from "../main";

export class CaptureModal extends Modal {
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
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
