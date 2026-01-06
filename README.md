# Obsidian Cooking Assistant

Unified Obsidian-first workflow for the cooking project:
- Async inbox capture for URL, text, and image jobs (Syncthing/Git as transport)
- Gemini-powered extraction into standardized recipe files
- Weekly Organiser preserved as a submodule for meal-planning UI (`scheduled`/`marked` semantics intact)
- Guaranteed `.webp` cover images and existing frontmatter schema (`title`, `type: recipe`, `source`, `added`, `cover`, `cooked`, `marked`, `scheduled`, `tags`)

## Architecture (high level)
```
[Mobile / Laptop] -> write job to cooking/inbox -> sync -> Obsidian vault
    ↓                                           (vault file events)
[InboxWatcher] -> Gemini -> RecipeWriter (.webp) -> recipes/
                               ↳ dedupe + archive/error quarantine
```

## Inbox schema (strict)
```json
{
  "type": "url" | "text" | "image",
  "content": "https://example.com/recipe",
  "created_at": "2026-01-06T12:00:00Z",
  "id": "uuid-v4",
  "source": "ios-shortcut"
}
```

## Guarantees and invariants
- Event-driven processing on vault `create/modify` in `cooking/inbox/` (periodic scan as fallback)
- Deterministic recipe slugs; duplicates skipped/archived with ledger
- `.webp` covers only (non-webp inputs are quarantined until converted)
- No servers; plugin runs when Obsidian is open

## Current status
- Repository scaffold in progress. Next steps: wire organiser submodule, implement inbox watcher + recipe writer, add schema/de-dupe tests.
