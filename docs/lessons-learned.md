# Lessons Learned

## Modular, Composable Architecture
- Isolate complex behaviors (like drag-and-drop) into dedicated hooks and components.
- Use class name prefixes so feature styling does not leak into other UI areas.
- Scope DOM queries to a feature container ref to prevent cross-feature side effects.
- Prefer render functions for item UIs so DnD can be reused across screens.
- Keep data access in a dedicated utility so UI changes do not impact storage logic.

## Frontmatter + DnD Mapping
- Treat `scheduled` as the source-of-truth date field and `marked` as the backlog flag; keep the mapping explicit.
- Normalize legacy fields (like `date`) in one place to avoid drift between UI and storage.
- FormKit transfers into empty columns can bypass `onTransfer`; use `insertEvent` to trigger the same update path.
- Ensure drop indicators and drop-target classes are cleaned up when leaving a column to avoid UI residue.
