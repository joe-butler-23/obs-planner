# Weekly Organiser Plugin Specification

## Overview
A weekly organiser plugin for Obsidian that allows users to plan their week by dragging and dropping recipes and exercises into day slots.

## User Stories
- As a user, I want to see a weekly view so I can plan my week.
- As a user, I want to drag recipes from my "Recipes" folder into a day of the week.
- As a user, I want to drag exercises from my "Exercises" folder into a day of the week.
- As a user, I want my plan to be saved automatically.

## Technical Requirements
- Language: TypeScript
- UI Framework: React
- Drag & Drop: @formkit/drag-and-drop (React bindings)
- Storage: Vault frontmatter (`scheduled`, `marked`) on recipe/exercise notes
  - `scheduled`: YYYY-MM-DD string for day columns
  - `marked`: boolean for the backlog column
  - Legacy fallback: read `date` if `scheduled` is absent

## Architecture Principles
- Modular, composable components and hooks so DnD logic is isolated and reusable.
- Namespaced DnD classes to reduce style collisions across the app.
- Scoped DOM queries via container refs to avoid cross-feature interference.
- Avoid redundant state updates during refreshes to reduce render churn.
- Use FormKit insert events to handle drops into empty columns.
