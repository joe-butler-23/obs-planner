import * as React from "react";
import { App, TFile, moment } from "obsidian";
import { createWeeklyOrganiserConfig } from "../boards/weeklyOrganiserConfig";
import { renderWeeklyOrganiserCard } from "../boards/weeklyOrganiserCard";
import { useKanbanBoard } from "../hooks/useKanbanBoard";
import { usePikadayDatePicker } from "../hooks/usePikadayDatePicker";
import { FieldManager } from "../utils/field-manager";

// Type cast for moment (Obsidian re-exports it)
const momentFn: any = moment;

interface WeeklyOrganiserBoardProps {
	app: App;
}

/**
 * Weekly Organiser Board - jKanban implementation
 */
export const WeeklyOrganiserBoard = ({ app }: WeeklyOrganiserBoardProps) => {
	const [weekOffset, setWeekOffset] = React.useState(0);
	const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
	const calendarInputRef = React.useRef<HTMLInputElement>(null);
	const calendarPopoverRef = React.useRef<HTMLDivElement>(null);
	const calendarToggleRef = React.useRef<HTMLButtonElement>(null);

	const boardId = React.useMemo(
		() => `weekly-organiser-board-${Math.random().toString(36).slice(2, 11)}`,
		[]
	);

	const fieldManager = React.useMemo(() => new FieldManager(app), [app]);

	const config = React.useMemo(
		() => createWeeklyOrganiserConfig(weekOffset),
		[weekOffset]
	);

	const handleDrop = React.useCallback(
		async (itemId: string, targetColumnId: string) => {
			const file = app.vault.getAbstractFileByPath(itemId);
			const targetColumn = config.columns.find(
				(c) => c.id === targetColumnId
			);

			if (file instanceof TFile && targetColumn) {
				await fieldManager.updateFieldForColumn(
					file,
					targetColumn,
					config.fieldMapping
				);
			}
		},
		[app, config, fieldManager]
	);

	const handleCardClick = React.useCallback(
		(event: MouseEvent, itemId: string, _itemEl: HTMLElement) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;

			const file = app.vault.getAbstractFileByPath(itemId);
			if (!(file instanceof TFile)) return;

			const isCtrlClick = event.ctrlKey || event.metaKey;
			const isImageClick = !!target.closest(".card-cover");

			if (isCtrlClick && isImageClick) {
				const leaf = app.workspace.getLeaf("split", "vertical");
				leaf.openFile(file, { active: true });
				return;
			}

			const leaf = app.workspace.getLeaf("split", "vertical");
			leaf.openFile(file, { active: true });
		},
		[app]
	);

	const { containerRef } = useKanbanBoard({
		app,
		boardId,
		config,
		renderItem: renderWeeklyOrganiserCard,
		itemClassName: "organiser-card",
		logPrefix: "WeeklyOrganiser",
		onDropItem: handleDrop,
		onCardClick: handleCardClick,
	});

	// Week navigation
	const startDate = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek");
	const endDate = startDate.clone().add(6, "days");
	const weekRangeDisplay = `${startDate.format("MMM Do")} - ${endDate.format("MMM Do, YYYY")}`;
	const startDateValue = startDate.format("YYYY-MM-DD");

	const handleCalendarSelect = React.useCallback((date: Date) => {
		if (!date) return;
		const selected = momentFn(date);
		if (!selected.isValid()) return;
		const offset = selected
			.startOf("isoWeek")
			.diff(momentFn().startOf("isoWeek"), "weeks");
		setWeekOffset(offset);
		setIsCalendarOpen(false);
	}, []);

	const { gotoToday, clear } = usePikadayDatePicker({
		isOpen: isCalendarOpen,
		inputRef: calendarInputRef,
		containerRef: calendarPopoverRef,
		selectedDate: startDate.toDate(),
		onSelect: handleCalendarSelect,
		onClose: () => setIsCalendarOpen(false),
	});

	// Close calendar when clicking outside
	React.useEffect(() => {
		if (!isCalendarOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const popover = calendarPopoverRef.current;
			const toggle = calendarToggleRef.current;

			// Check if click is inside the popover or toggle
			const isInsidePopover = popover?.contains(target);
			const isInsideToggle = toggle?.contains(target);

			// Check if click is on any pikaday element by walking up the tree
			let el: HTMLElement | null = target;
			let isInsidePikaday = false;
			while (el) {
				if (el.className && typeof el.className === "string" && el.className.includes("pika")) {
					isInsidePikaday = true;
					break;
				}
				el = el.parentElement;
			}

			if (!isInsidePopover && !isInsideToggle && !isInsidePikaday) {
				setIsCalendarOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isCalendarOpen]);

	return (
		<div className="weekly-organiser-container">
			<div className="organiser-header">
				<div className="week-nav">
					<button onClick={() => setWeekOffset((prev) => prev - 1)}>
						&lt;
					</button>
					<button onClick={() => setWeekOffset(0)}>Today</button>
					<div className="week-nav-calendar">
						<button
							ref={calendarToggleRef}
							className="calendar-toggle"
							aria-label="Choose week"
							onClick={() =>
								setIsCalendarOpen((prev) => !prev)
							}
							type="button"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width="16"
								height="16"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
								<line x1="16" y1="2" x2="16" y2="6" />
								<line x1="8" y1="2" x2="8" y2="6" />
								<line x1="3" y1="10" x2="21" y2="10" />
							</svg>
						</button>
						{isCalendarOpen && (
							<div
								className="calendar-popover"
								ref={calendarPopoverRef}
							>
								<input
									ref={calendarInputRef}
									className="calendar-input"
									type="text"
									aria-label="Choose week"
									value={startDateValue}
									readOnly
								/>
								<div className="pika-footer">
									<button
										type="button"
										className="pika-footer-btn"
										onClick={gotoToday}
									>
										Today
									</button>
									<button
										type="button"
										className="pika-footer-btn"
										onClick={clear}
									>
										Clear
									</button>
								</div>
							</div>
						)}
					</div>
					<button onClick={() => setWeekOffset((prev) => prev + 1)}>
						&gt;
					</button>
					<span className="week-range">{weekRangeDisplay}</span>
				</div>
			</div>
			<div
				id={boardId}
				ref={containerRef}
				className="weekly-organiser-kanban"
				style={{ overflowX: "auto", height: "calc(100% - 70px)" }}
			/>
		</div>
	);
};
