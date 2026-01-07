declare module "jkanban" {
	interface KanbanBoard {
		id: string;
		title: string;
		class?: string;
		item?: KanbanItem[];
	}

	interface KanbanItem {
		id: string;
		title: string;
		class?: string[];
		[key: string]: any;
	}

	interface KanbanOptions {
		element?: string | HTMLElement;
		gutter?: string;
		widthBoard?: string;
		responsivePercentage?: boolean;
		dragItems?: boolean;
		boards?: KanbanBoard[];
		dragBoards?: boolean;
		itemAddOptions?: {
			enabled?: boolean;
			content?: string;
			class?: string;
			footer?: boolean;
		};
		itemHandleOptions?: {
			enabled?: boolean;
			handleClass?: string;
			customCssHandler?: string;
			customCssIconHandler?: string;
			customHandler?: string;
		};
		click?: (el: HTMLElement, event: MouseEvent) => void;
		context?: (el: HTMLElement, event: MouseEvent) => void;
		dragEl?: (el: HTMLElement, source: HTMLElement) => void;
		dragendEl?: (el: HTMLElement) => void;
		dropEl?: (
			el: HTMLElement,
			target: HTMLElement,
			source: HTMLElement,
			sibling: HTMLElement
		) => void;
		dragBoard?: (el: HTMLElement, source: HTMLElement) => void;
		dragendBoard?: (el: HTMLElement) => void;
		buttonClick?: (el: HTMLElement, boardId: string) => void;
		propagationHandlers?: string[];
	}

	class jKanban {
		constructor(options: KanbanOptions);
		addElement(boardID: string, element: any): void;
		addBoards(boards: KanbanBoard[]): void;
		findElement(id: string): HTMLElement;
		getParentBoardID(id: string): string;
		removeElement(id: string): void;
		removeBoard(id: string): void;
		findBoard(id: string): any;
		getBoardElements(id: string): HTMLElement[];
		options: KanbanOptions;
	}

	export default jKanban;
}
