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
- [ ] T9 **UI Unification** (Post-T7)
    - [ ] T9.1 **Framework:** Migrate Health/Database views to React/Preact.
        - *Detail:* Adopt **Preact** (via `preact/compat` or direct) if appropriate for smaller bundle size. Rewrite `CookingHealthView` manual DOM code as a functional component.
        - *Verify:* Health View renders identical UI. Buttons (Refresh/Clear) work. Code uses JSX, not `el.createEl`.

## Completed
- [x] T1 Consolidate repositories (obs-sync, organiser, helper) into unified monorepo.
- [x] T2 Rename plugin and references to `mise-en-place`.
- [x] T4 Capture Recipe modal enhancement (URL input).
- [x] T7 **Modular Architecture Pass**
    - [x] T7.1 **Structure:** Moved planner code to `src/modules/organiser`.
    - [x] T7.2 **Cleanup:** Removed legacy `organiser/` repo root and consolidated deps.
    - [x] T7.3 **Integration:** Updated `CookingPlannerView` and all imports.
    - [x] T7.4 **Refactor Services:** Extracted `RecipeParser` and `TodoistApi`.
    - [x] T7.5 **Decoupling:** `WeeklyOrganiserBoard` now accepts `presets` via props.
    - [x] T7.6 **Tests:** Migrated organiser tests to Vitest.
- [x] T8 **Performance & Security Refactor**
    - [x] T8.1 **Security:** Replaced `execFile` with `requestUrl` for Todoist API.
    - [x] T8.2 **Performance:** Optimized `InboxWatcher` to use folder children instead of vault scan.
    - [x] T8.3 **Optimization:** Moved ledger sorting to the consumer (View/Service) layer.
- [x] **Regression Fix:** Re-applied and hardened Kanban drag-click suppression (increased to 500ms).

## Plan

### T9 UI Unification
**Goal:** Replace manual DOM manipulation with a modern component framework (React/Preact) for all remaining views.
**Reasoning:** `CookingHealthView` and `CookingDatabaseView` currently use `el.createEl` which is hard to maintain. Moving them to the same React engine used by the Planner ensures consistency and easier styling.