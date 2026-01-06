# Obsidian Cooking Assistant

Unified Obsidian-first workflow for the cooking project:
- Async inbox capture for URL, text, and image jobs (Syncthing/Git as transport)
- Deterministic-first extraction with Gemini fallback into standardized recipe files
- Weekly Organiser preserved as a submodule for meal-planning UI (`scheduled`/`marked` semantics intact)
- Health view for inbox + ledger status
- Recipe Database view for fast card-based browsing and marking
- Guaranteed `.webp` cover images and existing frontmatter schema (`title`, `type: recipe`, `source`, `added`, `cover`, `cooked`, `marked`, `scheduled`, `tags`)

## Workflow (flowchart)
```mermaid
flowchart TD
  A[Capture: URL / Text / Image] --> B[Inbox folder]
  B -->|vault create/modify| C[InboxWatcher]
  C --> D{Job type}
  D -->|URL| E[Fetch HTML + JSON-LD/WPRM]
  E --> F{Structured recipe?}
  F -->|Yes| G[Recipe object]
  F -->|No| H[Gemini 3 Flash (strict JSON)]
  D -->|Text| H
  D -->|Image| H
  H --> I[Filter against source text]
  G --> J[RecipeWriter]
  I --> J
  J --> K[Recipe .md + .webp cover]
  J --> L[Archive + ledger]
```

## Architecture (high level)
```
[Mobile / Laptop] -> write job to cooking/inbox -> sync -> Obsidian vault
    ↓                                           (vault file events)
[InboxWatcher] -> HTML/JSON-LD/WPRM -> Gemini (fallback) -> RecipeWriter (.webp) -> recipes/
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
- `.webp` covers only (non-webp inputs are converted on write)
- URL extraction prefers JSON-LD/WPRM; Gemini is a strict fallback
- No servers; plugin runs when Obsidian is open

## Testing / validation plan
- **Unit (Vitest):** inbox schema parsing, ledger pruning/dedupe, recipe frontmatter invariants, archive folder creation, duplicate slug handling.
- **Integration (vault sim):** inbox event handling routes jobs to writer, archive/quarantine paths created, `.webp` covers written.
- **Manual smoke:** drop URL/text/image jobs into `inbox/`, verify notices, archive/error files, recipe content, and Weekly Organiser behavior.

## Recipe Database view
- Command palette: `Open Recipe Database` (or use the grid ribbon icon).
- Ctrl/Cmd click opens a recipe in a new split; normal click opens in the current pane.
- Marked checkbox updates recipe frontmatter (`marked: true/false`).
- Settings: sort order, marked/scheduled filters, card minimum width, max cards.

## Performance notes
- Cached recipe index keyed by file fingerprint (mtime + size).
- Debounced refresh on vault/metadata changes to avoid re-render storms.
- Lazy-loaded images and minimal DOM per card.
- Max cards limit configurable for large vaults.

## Dev workflow (Obsidian hot-reload loop)
1) Build/watch the plugin and symlink into your vault:
```bash
VAULT_PATH=/path/to/your/vault ./scripts/obsidian-dev.sh
```
2) In Obsidian, enable **Cooking Assistant** and run `Open Cooking Planner`, `Open Cooking Health`, or `Open Recipe Database` once.
3) When code changes land, use Obsidian's `Reload app without saving` command (or the Hot Reload community plugin) to refresh the plugin.
