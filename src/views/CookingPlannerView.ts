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
}
