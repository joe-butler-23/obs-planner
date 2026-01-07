![Mise en Place Banner](media/mise-en-place-banner.png)

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
  F -->|No| H[Gemini Flash (latest, strict JSON)]
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
- Search bar + tag filter are in the view header.
- Settings: sort order, marked/scheduled filters, card minimum width, max cards.

## Todoist shopping list
- Cooking Planner view has a button to send a shopping list for the active week.
- Uses scheduled recipes only. Gemini mode reads full recipe markdown and outputs the merged shopping list directly.
- Preview option writes a markdown snapshot to `~/projects/sys-arc/resources/todoist-preview.md`.
- Also creates `🥕 - recipe title` tasks in the Bridge club project on the scheduled date (de-duped).
- Labeler mode (Settings -> Todoist):
  - **Gemini only**: Gemini Flash (latest) generates the shopping list items + labels; failures abort sending and log to Health.
  - **Deterministic only**: built-in keyword rules.

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
2) In Obsidian, enable **Mise en Place** and run `Open Cooking Planner`, `Open Cooking Health`, or `Open Recipe Database` once.
3) When code changes land, use Obsidian's `Reload app without saving` command (or the Hot Reload community plugin) to refresh the plugin.

## Partner Setup (Windows)
For non-technical partners sharing the vault:

1.  **Prerequisites:**
    *   **Obsidian:** Install the latest installer.
    *   **Syncthing:** Install "SyncTrayzor" (wrapper for Windows) or the base binary.
    *   **Tailscale:** Install and login to join the mesh network.

2.  **Sync Configuration:**
    *   Connect to the Tailscale network.
    *   Open Syncthing (SyncTrayzor).
    *   Accept the shared folder invitation from the host machine.
    *   Map the folder to a local path (e.g., `C:\Users\Name\Obsidian\MiseEnPlace`).

3.  **Obsidian Setup:**
    *   Open Obsidian -> "Open folder as vault" -> Select the mapped folder.
    *   The `mise-en-place` plugin and all recipes will sync automatically.
    *   **Note:** No manual plugin installation is required; Syncthing handles the plugin files.