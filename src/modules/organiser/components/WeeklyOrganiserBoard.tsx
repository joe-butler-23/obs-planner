import * as React from "react";
import { App, Notice, TFile, WorkspaceLeaf, moment } from "obsidian";
import { createWeeklyOrganiserConfig } from "../boards/weeklyOrganiserConfig";
import {
	renderWeeklyOrganiserCard,
	resolveWeeklyOrganiserCoverImage,
} from "../boards/weeklyOrganiserCard";
import { useKanbanBoard } from "../hooks/useKanbanBoard";
import { usePikadayDatePicker } from "../hooks/usePikadayDatePicker";
import {
	findPresetById,
	OrganiserPreset,
	OrganiserPresetId,
} from "../presets/organiserPresets";
import { OrganiserItem } from "../types";
import { buildBoardEntries } from "../kanban/buildBoardsData";
import { FieldManager } from "../utils/field-manager";
import {
	appendCookLogEntryToFile,
	CookLogEntryInput,
} from "../../cooking/services/RecipeLogService";

// Type cast for moment (Obsidian re-exports it)
const momentFn: any = moment;

interface WeeklyOrganiserBoardProps {
	app: App;
	presets: OrganiserPreset[];
	onSendShoppingList?: (payload: WeeklyOrganiserShoppingListPayload) => void;
}

export type WeeklyOrganiserShoppingListPayload = {
	recipePaths: string[];
	weekLabel: string;
	weekOffset: number;
};

type ReviewEntry = {
	path: string;
	title: string;
	scheduledDate: string;
	cookedDate: string;
	coverUrl: string;
	rating: string;
	makeAgain: "" | "yes" | "no";
	notes: string;
	include: boolean;
};

/**
 * Weekly Organiser Board - jKanban implementation
 */
export const WeeklyOrganiserBoard = ({
	app,
	presets,
	onSendShoppingList,
}: WeeklyOrganiserBoardProps) => {
	const [activePresetId, setActivePresetId] =
		React.useState<OrganiserPresetId>(presets[0]?.id);
	const [searchQuery, setSearchQuery] = React.useState("");
	const [activePopover, setActivePopover] = React.useState<
		"filter" | "group" | "sort" | null
	>(null);
	const [groupBy, setGroupBy] = React.useState("none");
	const [sortBy, setSortBy] = React.useState("default");
	const [showTimeControls, setShowTimeControls] = React.useState(true);
	const [weekOffset, setWeekOffset] = React.useState(0);
	const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
	const [isReviewOpen, setIsReviewOpen] = React.useState(false);
	const [reviewEntries, setReviewEntries] = React.useState<ReviewEntry[]>([]);
	const [isReviewSaving, setIsReviewSaving] = React.useState(false);
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
		() => findPresetById(activePresetId, presets),
		[activePresetId, presets]
	);

	const fieldManager = React.useMemo(() => new FieldManager(app), [app]);

	const config = React.useMemo(
		() => createWeeklyOrganiserConfig(weekOffset, activePreset),
		[weekOffset, activePreset]
	);

	const normalizeReviewDate = React.useCallback((value?: string) => {
		if (!value) return "";
		const trimmed = value.trim();
		if (!trimmed) return "";
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
		const parsed = momentFn(trimmed);
		return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
	}, []);

	const isRecipePreset = React.useMemo(
		() =>
			activePreset.typeFilter.some(
				(value) => value.toLowerCase() === "recipe"
			),
		[activePreset.typeFilter]
	);

	const loadReviewEntries = React.useCallback((): ReviewEntry[] => {
		const { entriesByFile } = buildBoardEntries(app, config, {
			logPrefix: "WeeklyOrganiser",
			logItemErrors: false,
		});

		return Array.from(entriesByFile.values())
			.filter((entry) => entry.item.type === "recipe" && entry.item.date)
			.sort((a, b) =>
				(a.item.date ?? "").localeCompare(b.item.date ?? "")
			)
			.map((entry) => {
				const scheduledDate = entry.item.date ?? "";
				const cookedDate = normalizeReviewDate(entry.item.date);
				const coverUrl = resolveWeeklyOrganiserCoverImage(
					app,
					entry.item
				);
				return {
					path: entry.filePath,
					title: entry.item.title,
					scheduledDate,
					cookedDate,
					coverUrl,
					rating: "",
					makeAgain: "",
					notes: "",
					include: true,
				};
			});
	}, [app, config, normalizeReviewDate]);

	React.useEffect(() => {
		if (!isReviewOpen) return;
		setReviewEntries(loadReviewEntries());
	}, [isReviewOpen, loadReviewEntries]);

	const updateReviewEntry = React.useCallback(
		(path: string, updates: Partial<ReviewEntry>) => {
			setReviewEntries((prev) =>
				prev.map((entry) =>
					entry.path === path ? { ...entry, ...updates } : entry
				)
			);
		},
		[]
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

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const stopIfToggle = (event: Event) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;
			if (!target.closest(".organiser-card__marked-toggle")) return;
			event.stopPropagation();
		};

		const handleChange = async (event: Event) => {
			const target = event.target as HTMLInputElement | null;
			if (!target?.classList.contains("organiser-card__marked-input")) return;
			event.stopPropagation();
			const itemId = target.dataset.itemId;
			if (!itemId) return;

			const file = app.vault.getAbstractFileByPath(itemId);
			if (!(file instanceof TFile)) return;

			target.disabled = true;
			try {
				await app.fileManager.processFrontMatter(file, (frontmatter) => {
					if (target.checked) {
						frontmatter.marked = true;
					} else {
						delete frontmatter.marked;
					}
				});
			} finally {
				target.disabled = false;
			}
		};

		container.addEventListener("mousedown", stopIfToggle, true);
		container.addEventListener("click", stopIfToggle, true);
		container.addEventListener("change", handleChange);

		return () => {
			container.removeEventListener("mousedown", stopIfToggle, true);
			container.removeEventListener("click", stopIfToggle, true);
			container.removeEventListener("change", handleChange);
		};
	}, [app, containerRef]);

	// Week navigation
	const startDate = momentFn()
		.add(weekOffset, "weeks")
		.startOf("isoWeek");
	const endDate = startDate.clone().add(6, "days");
	const weekRangeDisplay = `${startDate.format("MMM Do")} - ${endDate.format("MMM Do, YYYY")}`;
	const startDateValue = startDate.format("YYYY-MM-DD");

	const handleSendShoppingList = React.useCallback(() => {
		if (!onSendShoppingList) return;
		const { entriesByFile } = buildBoardEntries(app, config, {
			logPrefix: "WeeklyOrganiser",
			logItemErrors: false,
		});
		const recipePaths = Array.from(entriesByFile.values())
			.filter((entry) => entry.item.type === "recipe" && entry.item.date)
			.map((entry) => entry.filePath);
		if (recipePaths.length === 0) {
			new Notice("No scheduled recipes found for this week.");
			return;
		}
		onSendShoppingList({
			recipePaths,
			weekLabel: weekRangeDisplay,
			weekOffset,
		});
	}, [app, config, onSendShoppingList, weekOffset, weekRangeDisplay]);

	const handleToggleReview = React.useCallback(() => {
		if (isReviewOpen) {
			setIsReviewOpen(false);
			return;
		}
		setReviewEntries(loadReviewEntries());
		setIsReviewOpen(true);
	}, [isReviewOpen, loadReviewEntries]);

	const handleCompleteWeek = React.useCallback(async () => {
		if (isReviewSaving) return;

		if (reviewEntries.length === 0) {
			new Notice("No scheduled recipes found for this week.");
			return;
		}

		const logCount = reviewEntries.filter(
			(entry) => entry.include && entry.cookedDate.trim().length > 0
		).length;
		const confirmMessage =
			logCount > 0
				? `Save ${logCount} review${
						logCount === 1 ? "" : "s"
					} and clear scheduled recipes for ${weekRangeDisplay}?`
				: `Clear scheduled recipes for ${weekRangeDisplay}?`;

		if (!confirm(confirmMessage)) return;

		setIsReviewSaving(true);
		try {
			let loggedCount = 0;
			let clearedCount = 0;

			for (const entry of reviewEntries) {
				if (!entry.include) continue;
				const cookedDate = entry.cookedDate.trim();
				if (!cookedDate) continue;

				const file = app.vault.getAbstractFileByPath(entry.path);
				if (!(file instanceof TFile)) continue;

				const ratingValue = entry.rating ? Number(entry.rating) : null;
				const rating =
					ratingValue !== null && Number.isNaN(ratingValue)
						? null
						: ratingValue;
				const makeAgainValue =
					entry.makeAgain === ""
						? null
						: entry.makeAgain === "yes";

				const logEntry: CookLogEntryInput = {
					cookedDate,
					rating,
					makeAgain: makeAgainValue,
					notes: entry.notes,
				};

				try {
					await appendCookLogEntryToFile(app, file, logEntry);
					loggedCount += 1;
				} catch (error) {
					console.error("Failed to append cook log", {
						path: entry.path,
						error,
					});
				}
			}

			for (const entry of reviewEntries) {
				const file = app.vault.getAbstractFileByPath(entry.path);
				if (!(file instanceof TFile)) continue;
				try {
					await app.fileManager.processFrontMatter(
						file,
						(frontmatter) => {
							delete frontmatter.scheduled;
							delete frontmatter.date;
						}
					);
					clearedCount += 1;
				} catch (error) {
					console.error("Failed to clear scheduled date", {
						path: entry.path,
						error,
					});
				}
			}

			new Notice(
				`Logged ${loggedCount} recipe${
					loggedCount === 1 ? "" : "s"
				}, cleared ${clearedCount}.`
			);
			setIsReviewOpen(false);
			setWeekOffset((prev) => prev + 1);
		} catch (error) {
			console.error("Weekly review failed", error);
			new Notice("Weekly review failed. Check console for details.");
		} finally {
			setIsReviewSaving(false);
		}
	}, [app, isReviewSaving, reviewEntries, weekRangeDisplay]);

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
					{presets.map((preset) => (
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
					{onSendShoppingList && (
						<div className="topbar-action">
							<button
								className="topbar-icon-btn"
								type="button"
								title="Send shopping list to Todoist"
								aria-label="Send shopping list to Todoist"
								onClick={handleSendShoppingList}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<circle cx="9" cy="21" r="1" />
									<circle cx="20" cy="21" r="1" />
									<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
								</svg>
							</button>
						</div>
					)}
					{isRecipePreset && (
						<div className="topbar-action">
							<button
								className={`topbar-icon-btn${isReviewOpen ? " is-active" : ""}`}
								type="button"
								title="Review week"
								aria-label="Review week"
								aria-expanded={isReviewOpen}
								onClick={handleToggleReview}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
									<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
									<path d="m9 14 2 2 4-4" />
								</svg>
							</button>
						</div>
					)}
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
			{isReviewOpen && isRecipePreset && (
				<div className="weekly-review-panel">
					<div className="weekly-review-header">
						<div className="weekly-review-heading">
							<div className="weekly-review-title">Weekly review</div>
							<div className="weekly-review-meta">{weekRangeDisplay}</div>
						</div>
					</div>
					<div className="weekly-review-hint">
						Log what you cooked this week. Uncheck a recipe to skip logging.
					</div>
					{reviewEntries.length === 0 ? (
						<div className="weekly-review-empty">
							No scheduled recipes for this week.
						</div>
					) : (
						<div className="weekly-review-list">
							{reviewEntries.map((entry) => (
								<div
									key={entry.path}
									className={`weekly-review-row${
										entry.include ? "" : " is-disabled"
									}`}
								>
									<div className="weekly-review-row-header">
										<div className="weekly-review-row-info">
											{entry.coverUrl ? (
												<div className="weekly-review-thumb">
													<img
														src={entry.coverUrl}
														alt=""
														loading="lazy"
														aria-hidden="true"
													/>
												</div>
											) : null}
											<div className="weekly-review-row-title">
												<div className="weekly-review-row-name">
													{entry.title}
												</div>
												<div className="weekly-review-row-meta">
													Planned {entry.scheduledDate}
												</div>
											</div>
										</div>
										<div className="weekly-review-row-controls">
											<label className="weekly-review-inline weekly-review-inline--date">
												<span>Date</span>
												<input
													type="date"
													value={entry.cookedDate}
													onChange={(event) =>
														updateReviewEntry(entry.path, {
															cookedDate: event.target.value,
														})
													}
													disabled={isReviewSaving || !entry.include}
												/>
											</label>
											<label className="weekly-review-inline weekly-review-inline--rating">
												<span>Rate</span>
												<select
													value={entry.rating}
													onChange={(event) =>
														updateReviewEntry(entry.path, {
															rating: event.target.value,
														})
													}
													disabled={isReviewSaving || !entry.include}
												>
													<option value="">—</option>
													<option value="1">1</option>
													<option value="2">2</option>
													<option value="3">3</option>
													<option value="4">4</option>
													<option value="5">5</option>
												</select>
											</label>
											<label className="weekly-review-inline weekly-review-inline--again">
												<span>Again</span>
												<select
													value={entry.makeAgain}
													onChange={(event) =>
														updateReviewEntry(entry.path, {
															makeAgain: event.target.value as
																| ""
																| "yes"
																| "no",
														})
													}
													disabled={isReviewSaving || !entry.include}
												>
													<option value="">—</option>
													<option value="yes">Yes</option>
													<option value="no">No</option>
												</select>
											</label>
										</div>
										<label className="weekly-review-toggle">
											<input
												type="checkbox"
												checked={entry.include}
												onChange={(event) =>
													updateReviewEntry(entry.path, {
														include: event.target.checked,
													})
												}
												disabled={isReviewSaving}
											/>
											<span>Cooked</span>
										</label>
									</div>
									<label className="weekly-review-field weekly-review-field--notes">
										<span>Notes</span>
										<textarea
											rows={2}
											value={entry.notes}
											onChange={(event) =>
												updateReviewEntry(entry.path, {
													notes: event.target.value,
												})
											}
											disabled={isReviewSaving || !entry.include}
										/>
									</label>
								</div>
							))}
						</div>
					)}
					<div className="weekly-review-actions">
						<button
							type="button"
							onClick={() => setIsReviewOpen(false)}
							disabled={isReviewSaving}
						>
							Close
						</button>
						<button
							type="button"
							className="mod-cta"
							onClick={handleCompleteWeek}
							disabled={isReviewSaving || reviewEntries.length === 0}
						>
							{isReviewSaving ? "Saving..." : "Save review & clear week"}
						</button>
					</div>
				</div>
			)}
			<div
				id={boardId}
				ref={containerRef}
				className="weekly-organiser-kanban"
			/>
		</div>
	);
};
