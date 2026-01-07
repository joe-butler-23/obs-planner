import * as React from "react";
import { setIcon } from "obsidian";
import { RecipeIndexItem, RecipeIndexSort } from "../../modules/cooking/types";
import { CookingAssistantSettings } from "../../settings";

export type MarkedFilter = "all" | "marked" | "unmarked";
export type ScheduledFilter = "all" | "scheduled" | "unscheduled";
export type AddedFilter = "all" | "last-7-days";

export interface DatabaseState {
  search: string;
  sort: RecipeIndexSort;
  marked: MarkedFilter;
  scheduled: ScheduledFilter;
  added: AddedFilter;
  tags: string[];
}

interface CookingDatabaseProps {
  recipes: RecipeIndexItem[];
  totalCount: number;
  availableTags: string[];
  settings: CookingAssistantSettings;
  state: DatabaseState;
  onStateChange: (state: DatabaseState) => void;
  onOpenRecipe: (path: string, split: boolean) => void;
  onToggleMarked: (path: string, marked: boolean) => Promise<void>;
  onOpenPlanner: () => void;
  resolveCover: (path: string | null, source: string) => string | null;
}

const formatDate = (value: string | null) => (value ? value : "");

export const CookingDatabase: React.FC<CookingDatabaseProps> = ({
  recipes,
  totalCount,
  availableTags,
  settings,
  state,
  onStateChange,
  onOpenRecipe,
  onToggleMarked,
  onOpenPlanner,
  resolveCover
}) => {
  const [search, setSearch] = React.useState(state.search);
  const [tagMenuOpen, setTagMenuOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Sync local search if prop changes
  React.useEffect(() => {
    setSearch(state.search);
  }, [state.search]);

  // Debounce search update
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== state.search) {
        onStateChange({ ...state, search });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, state, onStateChange]);

  const updateState = (updates: Partial<DatabaseState>) => {
    onStateChange({ ...state, ...updates });
  };

  // Tag menu click outside
  React.useEffect(() => {
    if (!tagMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".cooking-db__tag-filter")) {
        setTagMenuOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [tagMenuOpen]);

  // Update CSS variables for responsive grid
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const grid = container.querySelector(".cooking-db__grid");
      if (!grid) return;
      
      const baseWidth = Math.max(160, settings.databaseCardMinWidth || 220);
      const scaledBase = Math.max(140, Math.round(baseWidth * 0.8));
      const minWidth = Math.max(140, scaledBase - 12);
      const maxWidth = Math.max(minWidth, scaledBase + 28);
      
      container.style.setProperty("--cooking-db-card-min", `${minWidth}px`);
      container.style.setProperty("--cooking-db-card-max", `${maxWidth}px`);

      const containerWidth = grid.clientWidth;
      if (!containerWidth) return;
      
      const gap = 12;
      const maxColumns = Math.max(1, Math.floor((containerWidth + gap) / (minWidth + gap)));
      
      let bestWidth = minWidth;
      let bestWhitespace = Number.POSITIVE_INFINITY;

      for (let cols = 1; cols <= maxColumns; cols += 1) {
        const rawWidth = (containerWidth - gap * (cols - 1)) / cols;
        const width = Math.floor(rawWidth);
        if (width < minWidth || width > maxWidth) continue;
        const used = width * cols + gap * (cols - 1);
        const whitespace = containerWidth - used;
        if (whitespace < bestWhitespace) {
          bestWhitespace = whitespace;
          bestWidth = width;
        }
      }

      if (!Number.isFinite(bestWhitespace)) {
        const width = Math.floor((containerWidth - gap * (maxColumns - 1)) / maxColumns);
        bestWidth = Math.max(minWidth, Math.min(maxWidth, width));
      }

      container.style.setProperty("--cooking-db-card-size", `${bestWidth}px`);
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [settings.databaseCardMinWidth]);

  return (
    <div className="cooking-db" ref={containerRef}>
      <div className="cooking-db__header">
        <h2>Recipe Database</h2>
        <div className="cooking-db__count">
          {recipes.length < totalCount
            ? `${recipes.length} of ${totalCount} recipes`
            : `${totalCount} recipes`}
        </div>
      </div>

      <div className="cooking-db__controls">
        <button
          className="cooking-db__icon-button"
          type="button"
          aria-label="Open Cooking Planner"
          onClick={onOpenPlanner}
          ref={(el) => el && setIcon(el, "calendar-days")}
        />

        <input
          className="cooking-db__search"
          type="search"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="cooking-db__select"
          value={state.sort}
          onChange={(e) => updateState({ sort: e.target.value as RecipeIndexSort })}
        >
          <option value="added-desc">Added (newest)</option>
          <option value="added-asc">Added (oldest)</option>
          <option value="title-asc">Title (A-Z)</option>
          <option value="title-desc">Title (Z-A)</option>
          <option value="scheduled-desc">Scheduled (latest)</option>
          <option value="scheduled-asc">Scheduled (oldest)</option>
        </select>

        <div className="cooking-db__tag-filter">
          <button
            className="cooking-db__select cooking-db__tag-toggle"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={tagMenuOpen}
            onClick={() => setTagMenuOpen(!tagMenuOpen)}
          >
            Tags:{" "}
            {state.tags.length === 0
              ? "all"
              : state.tags.length === 1
                ? state.tags[0]
                : `${state.tags.length} selected`}
          </button>
          {tagMenuOpen && (
            <div className="cooking-db__tag-menu" role="listbox">
              <label className="cooking-db__tag-option">
                <input
                  type="checkbox"
                  checked={state.tags.length === 0}
                  onChange={() => updateState({ tags: [] })}
                />
                <span>All tags</span>
              </label>
              {availableTags.map((tag) => (
                <label key={tag} className="cooking-db__tag-option">
                  <input
                    type="checkbox"
                    checked={state.tags.includes(tag)}
                    onChange={(e) => {
                      const newTags = e.target.checked
                        ? [...state.tags, tag]
                        : state.tags.filter((t) => t !== tag);
                      updateState({ tags: newTags });
                    }}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <select
          className="cooking-db__select"
          value={state.marked}
          onChange={(e) => updateState({ marked: e.target.value as MarkedFilter })}
        >
          <option value="all">All marked</option>
          <option value="marked">Marked only</option>
          <option value="unmarked">Unmarked only</option>
        </select>

        <select
          className="cooking-db__select"
          value={state.scheduled}
          onChange={(e) =>
            updateState({ scheduled: e.target.value as ScheduledFilter })
          }
        >
          <option value="all">All scheduled</option>
          <option value="scheduled">Scheduled only</option>
          <option value="unscheduled">Unscheduled only</option>
        </select>

        <select
          className="cooking-db__select"
          value={state.added}
          onChange={(e) => updateState({ added: e.target.value as AddedFilter })}
        >
          <option value="all">All added dates</option>
          <option value="last-7-days">Added in last 7 days</option>
        </select>
      </div>

      <div className="cooking-db__grid-container">
        <div className="cooking-db__grid">
          {recipes.length === 0 ? (
            <div className="cooking-db__empty">No recipes found.</div>
          ) : (
            recipes.map((recipe) => (
              <RecipeCard
                key={recipe.path}
                recipe={recipe}
                coverPath={resolveCover(recipe.coverPath, recipe.path)}
                onOpen={(split) => onOpenRecipe(recipe.path, split)}
                onToggleMarked={(marked) => onToggleMarked(recipe.path, marked)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const RecipeCard: React.FC<{
  recipe: RecipeIndexItem;
  coverPath: string | null;
  onOpen: (split: boolean) => void;
  onToggleMarked: (marked: boolean) => Promise<void>;
}> = React.memo(({ recipe, coverPath, onOpen, onToggleMarked }) => {
  const [toggleDisabled, setToggleDisabled] = React.useState(false);

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setToggleDisabled(true);
    try {
      await onToggleMarked(e.target.checked);
    } finally {
      setToggleDisabled(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(e.ctrlKey || e.metaKey);
    }
  };

  return (
    <div
      className="cooking-db__card"
      data-path={recipe.path}
      tabIndex={0}
      onClick={(e) => onOpen(e.ctrlKey || e.metaKey)}
      onKeyDown={handleKeyDown}
    >
      <div className={`cooking-db__cover ${!coverPath ? "cooking-db__cover--empty" : ""}`}>
        {coverPath && (
          <img src={coverPath} alt={recipe.title} loading="lazy" decoding="async" />
        )}
      </div>
      <div className="cooking-db__body">
        <div className="cooking-db__title">{recipe.title}</div>
        <div className="cooking-db__meta">
          {recipe.added ? `Added ${formatDate(recipe.added)}` : ""}
        </div>
        <div className="cooking-db__actions" onClick={(e) => e.stopPropagation()}>
          <label className="cooking-db__toggle">
            <input
              type="checkbox"
              checked={recipe.marked}
              onChange={handleToggle}
              disabled={toggleDisabled}
            />
            <span>Marked</span>
          </label>
        </div>
      </div>
    </div>
  );
});
