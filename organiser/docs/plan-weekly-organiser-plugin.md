# Implementation Plan - Weekly Organiser Plugin

## Phase 1: Project Initialization
- [x] Analyze requirements
- [x] Create `manifest.json`
- [x] Create `tsconfig.json`
- [x] Create `esbuild.config.mjs`
- [x] Setup folder structure (`src/`, `src/components/`, `src/styles/`)

## Phase 2: Obsidian Integration
- [x] Create `main.ts` with Plugin boilerplate
- [x] Register `OrganiserView`
- [x] Add Ribbon Icon

## Phase 3: React UI Development
- [x] Create `WeeklyOrganiserBoard.tsx`
- [x] Render cards via a dedicated HTML renderer
- [x] Integrate jKanban drag-and-drop (Dragula-based)
- [x] Add delegated click handling for ctrl/cmd image open in right split
- [x] Integrate Pikaday popover for week selection
- [x] Add preset switcher, search, and filter/group/sort popovers (WIP)

## Phase 4: Data Layer
- [x] Implement data loading/saving logic
- [x] Drive item inclusion via frontmatter `type` values
- [x] Add preset definitions for weekly/meal/exercise/task

## Phase 5: Finalization
- [x] Style the UI with CSS
- [x] Test on Desktop (build)
- [x] Scope calendar CSS overrides to avoid Obsidian button styling

## Phase 6: Testing & Validation
- [x] Setup Jest + React Testing Library
- [x] Write unit tests for data logic (parsing frontmatter)
- [x] Write component tests for Drag & Drop interactions
- [x] Migrated to jKanban for simpler drag-and-drop behavior

## Architecture Approach
- Keep drag-and-drop logic modular in a dedicated board component.
- Scope DOM queries to the organiser container to avoid cross-feature interference.
- Rebuild jKanban on refresh to keep Dragula containers in sync.
- Use delegated click handling to preserve ctrl/cmd click intent during DnD.
- Keep presets declarative so new domains can be added without touching DnD internals.
- Treat filter/group/sort as optional runtime layers (work in progress).

## Human-in-the-Loop Workflow
- [x] Development Build
- [x] Symlink
- [x] Verification
