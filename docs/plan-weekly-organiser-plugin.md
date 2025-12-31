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
- [x] Create `OrganiserComponent.tsx`
- [x] Implement `Card` component
- [x] Implement reusable `KanbanColumn` component
- [x] Implement reusable `useKanbanDragAndDrop` hook
- [x] Integrate FormKit drag-and-drop (insert + animations)

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
- [x] Migrated to `@formkit/drag-and-drop` for smoother drag-and-drop and insert indicators

## Architecture Approach
- Keep drag-and-drop logic modular and composable via a dedicated hook + column component.
- Scope DOM queries to the organiser container to avoid cross-feature interference.
- Diff refresh results before setting state to avoid redundant renders and DnD churn.
- Use FormKit insert events to ensure transfers into empty columns update frontmatter.
- Clean up drop indicators on drag leave to avoid lingering UI artifacts.

## Human-in-the-Loop Workflow
- [x] Development Build
- [x] Symlink
- [x] Verification
