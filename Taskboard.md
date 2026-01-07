---
title: Mise en Place Taskboard
type: taskboard
status: active
projects:
  - "[[mise-en-place]]"
created: 2026-01-07
---

# Mise en Place Taskboard

## Operating Rules
- Single tasknote for this project (SSOT by request).
- I add tasks here and move finished items to Completed.
- Work starts only after explicit go-ahead from you.
- Git: branch-per-task, atomic commits, conventional messages (feat/fix/refactor/docs/chore).

## Active
- [ ] T7.1 **Structure:** Move generic planner code from `organiser/src` to `src/modules/organiser` (create first-class module).
    - *Detail:* Create directory `src/modules/organiser`. Move all files from `organiser/src/*` into it. Do not change code logic yet.
    - *Verify:* `npm run build` succeeds. Plugin loads in Obsidian.
- [ ] T7.2 **Cleanup:** Remove legacy `organiser/` repo root and consolidate dependencies.
    - *Detail:* Delete `organiser/` folder (including its `package.json`). Ensure root `package.json` includes `jkanban`, `pikaday`, `react`, `react-dom`.
    - *Verify:* `npm install` and `npm run build` succeed without missing dependency errors.
- [ ] T7.3 **Integration:** Update `CookingPlannerView` and imports to use the new module.
    - *Detail:* Update imports in `src/views/CookingPlannerView.ts` from `../../organiser/src/view` to `../modules/organiser/view`. Check for other broken relative paths.
    - *Verify:* Open "Cooking Planner" view in Obsidian. The Kanban board must render and allow drag-and-drop.
- [ ] T7.4 **Refactor Services:** Split large services (`GeminiService`, `TodoistShoppingListService`).
    - *Detail:* Extract HTML/JSON-LD parsing logic from `GeminiService` into `src/services/RecipeParser.ts`. Extract Todoist API transport from `ShoppingListService` into `src/services/TodoistApi.ts`.
    - *Verify:* Existing tests `TodoistShoppingListService.test.ts` and `GeminiService.test.ts` (if any) must pass.
- [ ] T7.5 **Decoupling:** Refactor `WeeklyOrganiserBoard` to accept `presets` via props.
    - *Detail:* Remove hardcoded `import { ORGANISER_PRESETS }` in the Board component. Pass presets from the parent View.
    - *Verify:* Planner View still loads defaults.
- [ ] T7.6 **Tests:** Migrate organiser tests to Vitest.
    - *Detail:* Move tests to `src/modules/organiser/tests`. Update imports to use `vitest` instead of `jest` globals (if needed).
    - *Verify:* `npm run test` runs ALL tests (root + organiser) and passes.

- [ ] T8 **Performance & Security Refactor** (Post-T7)
    - [ ] T8.1 **Security:** Replace `execFile` with `requestUrl`.
        - *Detail:* In `TodoistShoppingListService`, replace `node:child_process` calls with Obsidian's `requestUrl` API. This removes the dependency on system `curl`.
        - *Verify:* "Send Shopping List" works on Desktop. Code does not import `child_process`.
    - [ ] T8.2 **Performance:** Optimize Vault Scans.
        - *Detail:* In `InboxWatcher`, stop using `vault.getFiles()`. Instead, use `vault.getAbstractFileByPath(inboxFolder)` and iterate its children.
        - *Verify:* Add a log. Trigger a file change. Ensure no "Scanning entire vault..." log appears.
    - [ ] T8.3 **Optimization:** Optimize Ledger sorting.
        - *Detail:* Remove `.sort()` from `serialize()`/`flush()`. Only sort when `getLedgerEntries()` is called by the View.
        - *Verify:* Logic check: `flush()` should be O(1) or O(record_size), not O(N log N).

- [ ] T9 **UI Unification** (Post-T7)
    - [ ] T9.1 **Framework:** Migrate Health/Database views to React/Preact.
        - *Detail:* Adopt **Preact** (via `preact/compat` or direct) if appropriate for smaller bundle size. Rewrite `CookingHealthView` manual DOM code as a functional component.
        - *Verify:* Health View renders identical UI. Buttons (Refresh/Clear) work. Code uses JSX, not `el.createEl`.

## Plan

### T7 Modular architecture pass (Details)
**Goal:** Transform the plugin from a dedicated "Meal Planner" into a modular foundation for a comprehensive "Life Planner" (incorporating Study, Health, Fitness, etc.).
**Vision:** The app must be modular, composable, and adaptable. We require clearly separate modules that can be stacked, edited, and amended without making the overall plugin brittle or prone to breaking. The purpose of this work is to ensure we have the required foundation to make further adaptations and adding new functionality trivial.

**Design Requirements:**
- **Data Source Abstraction:** The `organiser` module must accept configuration (columns, types) as props.
- **Extensible Actions:** Support "Action Slots" for domain-specific tools.
- **State Isolation:** Modules manage their own state while sharing the visual engine.

### T1 Consolidation and archive
1) Verify monorepo structure and confirm plugin load from `/home/joebutler/development/mise-en-place`.
2) Inventory old repos for any missing assets/config/scripts not yet moved.
3) Move old repos to archive and update any stale references/symlinks.
4) Verify: Obsidian plugin works, organiser works, sync scripts present.

### T2 Rename to mise-en-place (plugin + references)
1) Confirm manifest id/name, package name, docs, scripts, and symlink are all `mise-en-place`.
2) Search for old names and update any remaining references.
3) Verify: plugin loads under new name, commands/ribbons visible.

### T3 Kanban day split styling
1) Identify current CSS rules controlling card sizing per day column.
2) Reinstate half-height behavior for days with 2+ cards (non-marked column).
3) Verify: drag/drop and layout remain stable, no visual regressions.

### T4 Capture Recipe modal enhancement
1) Update capture modal to include URL input field and submit action.
2) Enforce inbox schema (type=url) with created_at/id/source fields.
3) Verify: a URL entered creates a valid inbox file and processes.

### T5 Health view UX upgrades
1) Make log entries selectable/copyable.
2) Add “Clear log” with confirm and ledger reset.
3) Add a notice when Todoist send starts.
4) Verify: health logs behave, no data loss without confirmation.

### T6 Documentation + Windows install
1) Update README to reflect current workflow and repo layout.
2) Add Windows prerequisites and “Tailscale + Syncthing only” install steps.
3) Verify: steps are complete and minimal for partner’s machine.

### T7 Modular architecture pass
**Goal:** Transform the plugin from a dedicated "Meal Planner" into a modular foundation for a comprehensive "Life Planner" (capable of handling Study, Health, Fitness, etc.).
**Requirement:** Components must be composable and adaptable. Adding a new domain (e.g., "Study") should be trivial and not risk breaking existing Cooking functionality. We need clearly separate modules that can be stacked or amended without making the overall plugin brittle.

**Execution Plan:**
1) **Structural Refactor:** Move generic Kanban/Calendar logic (`organiser/src`) to `src/modules/organiser` to serve as the core "Planner Engine".
2) **Dependency Consolidation:** Eliminate the legacy `organiser/` nested repo; centralize all dependencies in the root `package.json`.
3) **Module Integration:** Update `CookingPlannerView` to consume the `organiser` module as a dependency, establishing the pattern for future views (e.g., `StudyPlannerView`).
4) **Test Migration:** Move and update `organiser` tests to run under the root Vitest config, ensuring the core engine is robust.
5) **Verification:** Ensure the refactor preserves current functionality (hot reload, styling) while proving the architecture is ready for extension.

**Design Requirements (Future-Proofing):**
- **Data Source Abstraction:** The `organiser` module must eventually accept configuration (columns, types, data fetching logic) as props/interfaces, rather than hardcoding "Recipe" logic internally.
- **Extensible Actions:** The Planner UI must support "Action Slots" (e.g., "Send Shopping List") so different domains (Cooking vs. Study) can inject their own specific tools without forking the engine.
- **State Isolation:** Future modules (Study, Fitness) should manage their own state/settings while sharing the core Planner visualization.

## Completed
- [x] T1 Consolidate obsidian-cooking-assistant, obsidian-organiser, and obs-sync into a single `mise-en-place` repo without losing functionality.
- [x] T2 Rename plugin/package to `mise-en-place` (manifest id, folder names, symlinks, docs) and verify Obsidian load.
- [x] T4 Capture Recipe menu: add URL input field to create inbox entries directly from the popup.
