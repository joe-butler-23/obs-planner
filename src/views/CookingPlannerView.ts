import { WorkspaceLeaf } from "obsidian";
import { WeeklyOrganiserView } from "../../organiser/src/view";

export const VIEW_TYPE_COOKING_PLANNER = "cooking-planner-view";

export class CookingPlannerView extends WeeklyOrganiserView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_COOKING_PLANNER;
  }

  getDisplayText() {
    return "Cooking Planner";
  }

  getIcon() {
    return "calendar-days";
  }

  async onOpen() {
    await super.onOpen();
    this.contentEl.addClass("cooking-planner-view");
  }

  async onClose() {
    this.contentEl.removeClass("cooking-planner-view");
    await super.onClose();
  }
}
