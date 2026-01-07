# Weekly Organiser Plugin Specification

## Overview
A weekly organiser plugin for Obsidian that allows users to plan their week by dragging and dropping items into day slots. Presets drive the view (weekly, meal, exercise, task) and determine which frontmatter types are included.

## User Stories
- As a user, I want to see a weekly view so I can plan my week.
- As a user, I want to switch between presets (weekly, meal, exercise, task).
- As a user, I want to drag recipes, exercises, or tasks into a day of the week.
- As a user, I want my plan to be saved automatically.
- As a user, I want to search and optionally group/sort items (work in progress).

## Technical Requirements
- Language: TypeScript
- UI Framework: React
- Drag & Drop: jKanban (Dragula-based)
- Week Picker: Pikaday datepicker rendered in a popover
- Calendar styling: scoped CSS overrides to avoid Obsidian button theming within Pikaday
- Storage: Vault frontmatter (`scheduled`, `marked`) on item notes
  - `scheduled`: YYYY-MM-DD string for day columns
  - `marked`: boolean for the backlog column
  - Legacy fallback: read `date` if `scheduled` is absent
- Item inclusion: frontmatter `type` drives preset filtering
  - `type: recipe`, `type: exercise`, `type: task`
  - Presets define the allowed `type` values
- Click behavior: ctrl/cmd + click on card image opens in right split; standard click opens in right split; ignore clicks immediately after drag.
- Top bar controls: preset switcher, search, and filter/group/sort (work in progress).

## Architecture Principles
- Modular, composable components and hooks so DnD logic is isolated and reusable.
- Namespaced DnD classes to reduce style collisions across the app.
- Scoped DOM queries via container refs to avoid cross-feature interference.
- Avoid redundant state updates during refreshes to reduce render churn.
- Rebuild jKanban on refresh to keep Dragula containers in sync.
- Preset-driven configuration for flexible reuse across domains.
