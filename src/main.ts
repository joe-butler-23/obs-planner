import { Plugin, WorkspaceLeaf } from 'obsidian';
import { WeeklyOrganiserView, VIEW_TYPE_WEEKLY_ORGANISER } from './view';

export default class WeeklyOrganiserPlugin extends Plugin {
	async onload() {
		this.registerView(
			VIEW_TYPE_WEEKLY_ORGANISER,
			(leaf) => new WeeklyOrganiserView(leaf)
		);

		this.addRibbonIcon('calendar-days', 'Weekly Organiser', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-weekly-organiser',
			name: 'Open Weekly Organiser',
			callback: () => {
				this.activateView();
			},
		});
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_ORGANISER);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf(true); // 'true' creates a new leaf in the center/main area
			await leaf.setViewState({
				type: VIEW_TYPE_WEEKLY_ORGANISER,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_WEEKLY_ORGANISER);
	}
}
