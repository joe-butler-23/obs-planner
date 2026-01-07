import { WorkspaceLeaf } from "obsidian";
import CookingAssistantPlugin from "../main";
import { TodoistShoppingListService } from "../services/TodoistShoppingListService";
import {
  WeeklyOrganiserShoppingListPayload,
  WeeklyOrganiserView
} from "../modules/organiser/view";

export const VIEW_TYPE_COOKING_PLANNER = "cooking-planner-view";

export class CookingPlannerView extends WeeklyOrganiserView {
  private todoistService: TodoistShoppingListService;

  constructor(leaf: WorkspaceLeaf, plugin: CookingAssistantPlugin) {
    super(leaf);
    this.todoistService = new TodoistShoppingListService(this.app, plugin);
    this.setOnSendShoppingList((payload) => {
      void this.handleSendShoppingList(payload);
    });
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

  private async handleSendShoppingList(payload: WeeklyOrganiserShoppingListPayload) {
    new Notice("Sending shopping list to Todoist...");
    await this.todoistService.sendShoppingList({
      recipePaths: payload.recipePaths,
      weekLabel: payload.weekLabel
    });
  }
}
