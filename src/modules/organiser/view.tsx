import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import {
	WeeklyOrganiserBoard,
	WeeklyOrganiserShoppingListPayload,
} from "./components/WeeklyOrganiserBoard";
import { ORGANISER_PRESETS, OrganiserPreset } from "./presets/organiserPresets";

export const VIEW_TYPE_WEEKLY_ORGANISER = "weekly-organiser-view";

export class WeeklyOrganiserView extends ItemView {
	root: Root | null = null;
	protected presets: OrganiserPreset[] = ORGANISER_PRESETS;
	private onSendShoppingList?: (
		payload: WeeklyOrganiserShoppingListPayload
	) => void;

	constructor(
		leaf: WorkspaceLeaf,
		onSendShoppingList?: (
			payload: WeeklyOrganiserShoppingListPayload
		) => void
	) {
		super(leaf);
		this.onSendShoppingList = onSendShoppingList;
	}

	setOnSendShoppingList(
		handler?: (payload: WeeklyOrganiserShoppingListPayload) => void
	) {
		this.onSendShoppingList = handler;
	}

	getViewType() {
		return VIEW_TYPE_WEEKLY_ORGANISER;
	}

	getDisplayText() {
		return "Weekly Organiser";
	}

	getIcon() {
		return "calendar-days";
	}

	async onOpen() {
		this.contentEl.empty();
		console.log("[WeeklyOrganiserView] onOpen");
		this.root = createRoot(this.contentEl);
		this.root.render(
			<React.StrictMode>
				<div className="weekly-organiser-view-container">
					<WeeklyOrganiserBoard
						app={this.app}
						presets={this.presets}
						onSendShoppingList={this.onSendShoppingList}
					/>
				</div>
			</React.StrictMode>
		);
	}

	async onClose() {
		console.log("[WeeklyOrganiserView] onClose");
		this.root?.unmount();
	}
}

export type { WeeklyOrganiserShoppingListPayload };