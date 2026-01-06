import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { WeeklyOrganiserBoard } from "./components/WeeklyOrganiserBoard";

export const VIEW_TYPE_WEEKLY_ORGANISER = "weekly-organiser-view";

export class WeeklyOrganiserView extends ItemView {
	root: Root | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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
					<WeeklyOrganiserBoard app={this.app} />
				</div>
			</React.StrictMode>
		);
	}

	async onClose() {
		console.log("[WeeklyOrganiserView] onClose");
		this.root?.unmount();
	}
}
