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
- [ ] T11 **Release Prep**
    - [ ] T11.1 **Versioning:** Bump version in `manifest.json` and `package.json` to 0.1.0.
    - [ ] T11.2 **Documentation:** Update README.md to reflect Async Inbox architecture and new Todoist settings.
    - [ ] T11.3 **Polish:** Remove debug console logs and verify UI error states.
    - [ ] T11.4 **Final Sync:** Perform a final git push to confirm remote parity.

## Completed
- [x] T1 Consolidate repositories (obs-sync, organiser, helper) into unified monorepo.
- [x] T2 Rename plugin and references to `mise-en-place`.
- [x] T4 Capture Recipe modal enhancement (URL input).
- [x] T7 **Modular Architecture Pass**
    - [x] T7.1 Structure: Moved planner code to `src/modules/organiser`.
    - [x] T7.2 Cleanup: Removed legacy `organiser/` repo root and consolidated deps.
    - [x] T7.3 Integration: Updated `CookingPlannerView` and all imports.
    - [x] T7.4 Refactor Services: Extracted `RecipeParser` and `TodoistApi`.
    - [x] T7.5 Decoupling: `WeeklyOrganiserBoard` now accepts `presets` via props.
    - [x] T7.6 Tests: Migrated organiser tests to Vitest.
- [x] T8 **Performance & Security Refactor**
    - [x] T8.1 Security: Replaced `execFile` with `requestUrl` for Todoist API.
    - [x] T8.2 Performance: Optimized `InboxWatcher` to use folder children instead of vault scan.
    - [x] T8.3 Optimization: Moved ledger sorting to the consumer (View/Service) layer.
- [x] T9 **UI Unification**
    - [x] T9.1 Framework: Migrated Health/Database views to React components.
- [x] T10 **Legacy Cleanup**
    - [x] T10.1 Remove Sync: Deleted legacy `sync/` directory.
    - [x] T10.2 Remove Scripts: Deleted obsolete `todoist_client.py`.
    - [x] T10.3 Remove Docs: Deleted `REFACTOR-PLAN.md.md`.
- [x] **Regression Fix:** Re-applied and hardened Kanban drag-click suppression (increased to 500ms).

## Plan

### T11 Release Prep
**Goal:** Prepare the codebase for release/deployment.
**Reasoning:** The architecture is stable and clean. We should version it and document the new "Cooking Assistant" features.
