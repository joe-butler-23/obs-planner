# Lessons Learned

## Modular, Composable Architecture
- Isolate complex behaviors (like drag-and-drop) into dedicated hooks and components.
- Use class name prefixes so feature styling does not leak into other UI areas.
- Scope DOM queries to a feature container ref to prevent cross-feature side effects.
- Prefer render functions for item UIs so DnD can be reused across screens.
- Keep data access in a dedicated utility so UI changes do not impact storage logic.
- When a library exports a constructor in a non-standard way, add a resolver instead of assuming a default export.
- Prefer event delegation for card clicks when the DnD library does not pass through MouseEvent data.
- When integrating third-party UI (like Pikaday), keep styling overrides scoped to the component to avoid clashing with Obsidian theme button styles.
- Use presets to keep domain-specific logic (fields, filters) declarative and swappable.
- Treat runtime filter/group/sort as optional layers (work in progress) to avoid hard-coding UI assumptions.

## Frontmatter + DnD Mapping
- Treat `scheduled` as the source-of-truth date field and `marked` as the backlog flag; keep the mapping explicit.
- Normalize legacy fields (like `date`) in one place to avoid drift between UI and storage.
- Verify column IDs match normalized frontmatter values when items do not appear where expected.
- Add targeted debug logs around transfers and frontmatter writes, then remove once stable.
- Use frontmatter `type` to include items in presets instead of relying on folder paths.
