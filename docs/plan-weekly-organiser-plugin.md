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

## Phase 4: Data Layer
- [x] Implement data loading/saving logic
- [x] Implement folder scanning for recipes and exercises

## Phase 5: Finalization
- [x] Style the UI with CSS
- [x] Test on Desktop (build)

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

## Human-in-the-Loop Workflow
- [x] Development Build
- [x] Symlink
- [x] Verification
