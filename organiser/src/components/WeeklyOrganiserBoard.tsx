import * as React from "react";
import { App, TFile, WorkspaceLeaf, moment } from "obsidian";
import { createWeeklyOrganiserConfig } from "../boards/weeklyOrganiserConfig";
import { renderWeeklyOrganiserCard } from "../boards/weeklyOrganiserCard";
import { useKanbanBoard } from "../hooks/useKanbanBoard";
import { usePikadayDatePicker } from "../hooks/usePikadayDatePicker";
import {
	findPresetById,
	ORGANISER_PRESETS,
	OrganiserPresetId,
} from "../presets/organiserPresets";
import { OrganiserItem } from "../types";
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
	const [activePresetId, setActivePresetId] =
		React.useState<OrganiserPresetId>(ORGANISER_PRESETS[0].id);
	const [searchQuery, setSearchQuery] = React.useState("");
	const [activePopover, setActivePopover] = React.useState<
		"filter" | "group" | "sort" | null
	>(null);
	const [groupBy, setGroupBy] = React.useState("none");
	const [sortBy, setSortBy] = React.useState("default");
	const [showTimeControls, setShowTimeControls] = React.useState(true);
	const [weekOffset, setWeekOffset] = React.useState(0);
	const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
	const calendarInputRef = React.useRef<HTMLInputElement>(null);
	const calendarPopoverRef = React.useRef<HTMLDivElement>(null);
	const calendarToggleRef = React.useRef<HTMLButtonElement>(null);
	const filterButtonRef = React.useRef<HTMLButtonElement>(null);
	const filterPopoverRef = React.useRef<HTMLDivElement>(null);
	const groupButtonRef = React.useRef<HTMLButtonElement>(null);
	const groupPopoverRef = React.useRef<HTMLDivElement>(null);
	const sortButtonRef = React.useRef<HTMLButtonElement>(null);
	const sortPopoverRef = React.useRef<HTMLDivElement>(null);

	const boardId = React.useMemo(
		() => `weekly-organiser-board-${Math.random().toString(36).slice(2, 11)}`,
		[]
	);
	const lastOpenLeafRef = React.useRef<WorkspaceLeaf | null>(null);

	const activePreset = React.useMemo(
		() => findPresetById(activePresetId),
		[activePresetId]
	);

	const fieldManager = React.useMemo(() => new FieldManager(app), [app]);

	const config = React.useMemo(
		() => createWeeklyOrganiserConfig(weekOffset, activePreset),
		[weekOffset, activePreset]
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
			const file = app.vault.getAbstractFileByPath(itemId);
			if (!(file instanceof TFile)) return;

			const isForceSplit = event.ctrlKey || event.metaKey;
			const isValidLeaf = (leaf: WorkspaceLeaf | null) => {
				if (!leaf) return false;
				if (leaf.view?.getViewType?.() === "weekly-organiser-view") {
					return false;
				}
				const viewState = leaf.getViewState();
				if (viewState?.pinned) return false;
				return true;
			};
			let leaf: WorkspaceLeaf;
			if (isForceSplit) {
				leaf = app.workspace.getLeaf("split", "vertical");
			} else if (isValidLeaf(lastOpenLeafRef.current)) {
				leaf = lastOpenLeafRef.current as WorkspaceLeaf;
			} else {
				const recentLeaf = app.workspace.getMostRecentLeaf();
				const fallbackLeaf = app.workspace
					.getLeavesOfType("markdown")
					.find((candidate) => isValidLeaf(candidate));
				leaf = isValidLeaf(recentLeaf)
					? (recentLeaf as WorkspaceLeaf)
					: fallbackLeaf ?? app.workspace.getLeaf("split", "vertical");
			}
			lastOpenLeafRef.current = leaf;
			leaf.openFile(file, { active: true });
		},
		[app]
	);

	const normalizedSearch = React.useMemo(
		() => searchQuery.trim().toLowerCase(),
		[searchQuery]
	);

	const runtimeFilter = React.useCallback(
		(item: OrganiserItem) => {
			if (!normalizedSearch) return true;
			return (
				item.title.toLowerCase().includes(normalizedSearch) ||
				item.path.toLowerCase().includes(normalizedSearch)
			);
		},
		[normalizedSearch]
	);

	const runtimeSort = React.useMemo(() => {
		if (sortBy === "title-asc") {
			return (a: OrganiserItem, b: OrganiserItem) =>
				a.title.localeCompare(b.title);
		}
		if (sortBy === "title-desc") {
			return (a: OrganiserItem, b: OrganiserItem) =>
				b.title.localeCompare(a.title);
		}
		return undefined;
	}, [sortBy]);

	const groupByFn = React.useMemo(() => {
		if (groupBy === "type") {
			return (item: OrganiserItem) => item.type;
		}
		return undefined;
	}, [groupBy]);

	const groupLabel = React.useCallback((groupId: string) => {
		switch (groupId) {
			case "recipe":
				return "Recipes";
			case "exercise":
				return "Exercise";
			case "task":
				return "Tasks";
			case "Ungrouped":
				return "Other";
			default:
				return groupId
					.split("-")
					.map((part) =>
						part ? part[0].toUpperCase() + part.slice(1) : ""
					)
					.join(" ");
		}
	}, []);

	const groupOrder = React.useMemo(() => {
		if (groupBy !== "type") return undefined;
		const orderMap = new Map<string, number>();
		activePreset.typeFilter.forEach((value, index) => {
			orderMap.set(value.toLowerCase(), index);
		});
		return (a: string, b: string) => {
			const aIndex = orderMap.get(a.toLowerCase());
			const bIndex = orderMap.get(b.toLowerCase());
			if (aIndex === undefined && bIndex === undefined) {
				return a.localeCompare(b);
			}
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		};
	}, [activePreset.typeFilter, groupBy]);

	const groupOptions = React.useMemo(() => {
		const options = [{ id: "none", label: "None" }];
		for (const field of activePreset.fields) {
			if (field.groupable) {
				options.push({ id: field.key, label: field.label });
			}
		}
		return options;
	}, [activePreset.fields]);

	const sortOptions = React.useMemo(
		() => [
			{ id: "default", label: "Default" },
			{ id: "title-asc", label: "Title A-Z" },
			{ id: "title-desc", label: "Title Z-A" },
		],
		[]
	);

	React.useEffect(() => {
		if (!groupOptions.some((option) => option.id === groupBy)) {
			setGroupBy("none");
		}
	}, [groupBy, groupOptions]);

	const isTimeRowVisible = activePreset.isTimeBased && showTimeControls;

	React.useEffect(() => {
		if (!isTimeRowVisible && isCalendarOpen) {
			setIsCalendarOpen(false);
		}
	}, [isCalendarOpen, isTimeRowVisible]);

	const { containerRef } = useKanbanBoard({
		app,
		boardId,
		config,
		renderItem: (item) => renderWeeklyOrganiserCard(app, item),
		itemClassName: "organiser-card",
		logPrefix: "WeeklyOrganiser",
		logItemErrors: true,
		onDropItem: handleDrop,
		onCardClick: handleCardClick,
		runtimeFilter,
		runtimeSort,
		groupBy: groupByFn,
		groupLabel,
		groupOrder,
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

	React.useEffect(() => {
		if (!activePopover) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;

			const isInside = (ref: React.RefObject<HTMLElement>) =>
				Boolean(ref.current?.contains(target));

			const popoverRefs = {
				filter: {
					button: filterButtonRef,
					panel: filterPopoverRef,
				},
				group: {
					button: groupButtonRef,
					panel: groupPopoverRef,
				},
				sort: {
					button: sortButtonRef,
					panel: sortPopoverRef,
				},
			};

			const activeRefs = popoverRefs[activePopover];
			if (
				isInside(activeRefs.button) ||
				isInside(activeRefs.panel)
			) {
				return;
			}

			setActivePopover(null);
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, [activePopover]);

	const togglePopover = React.useCallback(
		(name: "filter" | "group" | "sort") => {
			setActivePopover((prev) => (prev === name ? null : name));
		},
		[]
	);

	const isFilterActive = !showTimeControls && activePreset.isTimeBased;
	const isGroupActive = groupBy !== "none";
	const isSortActive = sortBy !== "default";

	return (
		<div className="weekly-organiser-container">
			<div className="organiser-topbar">
				<select
					id="preset-select"
					className="topbar-select"
					value={activePresetId}
					onChange={(event) =>
						setActivePresetId(
							event.target.value as OrganiserPresetId
						)
					}
				>
					{ORGANISER_PRESETS.map((preset) => (
						<option key={preset.id} value={preset.id}>
							{preset.label}
						</option>
					))}
				</select>

				<input
					id="board-search"
					className="topbar-input"
					type="search"
					placeholder="Search..."
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
				/>

				{isTimeRowVisible && (
					<div className="week-nav">
						<button
							type="button"
							className="week-nav-btn"
							onClick={() => setWeekOffset((prev) => prev - 1)}
							aria-label="Previous week"
						>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="15 18 9 12 15 6" />
							</svg>
						</button>
						<button
							type="button"
							className="week-nav-btn"
							onClick={() => setWeekOffset(0)}
						>
							Today
						</button>
						<div className="week-nav-calendar">
							<button
								ref={calendarToggleRef}
								className="week-nav-btn"
								aria-label="Choose week"
								onClick={() => setIsCalendarOpen((prev) => !prev)}
								type="button"
							>
								<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
									<line x1="16" y1="2" x2="16" y2="6" />
									<line x1="8" y1="2" x2="8" y2="6" />
									<line x1="3" y1="10" x2="21" y2="10" />
								</svg>
							</button>
							{isCalendarOpen && (
								<div className="calendar-popover" ref={calendarPopoverRef}>
									<input
										ref={calendarInputRef}
										className="calendar-input"
										type="text"
										aria-label="Choose week"
										value={startDateValue}
										readOnly
									/>
									<div className="pika-footer">
										<button type="button" className="pika-footer-btn" onClick={gotoToday}>
											Today
										</button>
										<button type="button" className="pika-footer-btn" onClick={clear}>
											Clear
										</button>
									</div>
								</div>
							)}
						</div>
						<button
							type="button"
							className="week-nav-btn"
							onClick={() => setWeekOffset((prev) => prev + 1)}
							aria-label="Next week"
						>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</button>
						<span className="week-range">{weekRangeDisplay}</span>
					</div>
				)}

				<div className="topbar-actions">
					<div className="topbar-action">
						<button
							ref={filterButtonRef}
							className={`topbar-icon-btn${isFilterActive ? " is-active" : ""}`}
							type="button"
							title="Filter"
							aria-label="Filter"
							aria-expanded={activePopover === "filter"}
							onClick={() => togglePopover("filter")}
						>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="21" x2="14" y1="4" y2="4" />
								<line x1="10" x2="3" y1="4" y2="4" />
								<line x1="21" x2="12" y1="12" y2="12" />
								<line x1="8" x2="3" y1="12" y2="12" />
								<line x1="21" x2="16" y1="20" y2="20" />
								<line x1="12" x2="3" y1="20" y2="20" />
								<circle cx="12" cy="4" r="2" />
								<circle cx="10" cy="12" r="2" />
								<circle cx="14" cy="20" r="2" />
							</svg>
						</button>
						{activePopover === "filter" && (
							<div ref={filterPopoverRef} className="topbar-popover">
								{activePreset.isTimeBased && (
									<label className="topbar-toggle">
										<input
											type="checkbox"
											checked={showTimeControls}
											onChange={(event) =>
												setShowTimeControls(event.target.checked)
											}
										/>
										<span>Show date row</span>
									</label>
								)}
							</div>
						)}
					</div>
					<div className="topbar-action">
						<button
							ref={groupButtonRef}
							className={`topbar-icon-btn${isGroupActive ? " is-active" : ""}`}
							type="button"
							title="Group"
							aria-label="Group"
							aria-expanded={activePopover === "group"}
							onClick={() => togglePopover("group")}
						>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<polygon points="12 2 2 7 12 12 22 7 12 2" />
								<polyline points="2 17 12 22 22 17" />
								<polyline points="2 12 12 17 22 12" />
							</svg>
						</button>
						{activePopover === "group" && (
							<div ref={groupPopoverRef} className="topbar-popover">
								{groupOptions.map((option) => (
									<button
										key={option.id}
										type="button"
										className={`topbar-option${groupBy === option.id ? " is-active" : ""}`}
										onClick={() => {
											setGroupBy(option.id);
											setActivePopover(null);
										}}
									>
										{option.label}
									</button>
								))}
							</div>
						)}
					</div>
					<div className="topbar-action">
						<button
							ref={sortButtonRef}
							className={`topbar-icon-btn${isSortActive ? " is-active" : ""}`}
							type="button"
							title="Sort"
							aria-label="Sort"
							aria-expanded={activePopover === "sort"}
							onClick={() => togglePopover("sort")}
						>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="m21 16-4 4-4-4" />
								<path d="M17 20V4" />
								<path d="m3 8 4-4 4 4" />
								<path d="M7 4v16" />
							</svg>
						</button>
						{activePopover === "sort" && (
							<div ref={sortPopoverRef} className="topbar-popover">
								{sortOptions.map((option) => (
									<button
										key={option.id}
										type="button"
										className={`topbar-option${sortBy === option.id ? " is-active" : ""}`}
										onClick={() => {
											setSortBy(option.id);
											setActivePopover(null);
										}}
									>
										{option.label}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
			<div
				id={boardId}
				ref={containerRef}
				className="weekly-organiser-kanban"
			/>
		</div>
	);
};
