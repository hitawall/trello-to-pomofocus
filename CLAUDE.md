# Trello → Pomofocus Chrome Extension

## Project Overview
A personal Chrome extension (MV3) that syncs pending Trello cards from configured lists to pomofocus.io tasks. Uses DOM interaction for pomofocus (no public API) and Trello's REST API.

## File Map
| File | Role |
|------|------|
| `manifest.json` | MV3 extension config, permissions, content script registration |
| `popup.html/css/js` | Extension popup: shows config summary, Sync button, status |
| `options.html/js` | First-time setup: Trello API key, OAuth token, board/list config |
| `background.js` | Service worker: Trello REST API calls |
| `pomofocus-content.js` | Content script on pomofocus.io: reads/writes tasks via DOM |
| `icons/` | 16/48/128px PNGs (tomato red circle) |

## Data Stored (chrome.storage.sync)
```
apiKey       - Trello API key
token        - Trello OAuth token
boardId      - selected Trello board ID
boardName    - display name of selected board
includeLists - comma-separated list names to sync (e.g. "To Do,In Progress")
```

## Key Conventions
- No build tools — plain ES2020 JS, HTML, CSS
- All async/await, no callbacks except where Chrome APIs require them
- No external dependencies
- MV3 service worker: stateless, all config read from chrome.storage per request

## Trello API
- Base URL: `https://api.trello.com/1`
- Auth: `?key={apiKey}&token={token}` on every request
- Token obtained via `chrome.identity.launchWebAuthFlow` → Trello OAuth

## Pomofocus DOM Notes
Content script selectors are in `pomofocus-content.js` under `SELECTORS`.
If pomofocus updates their DOM, update those selectors. The `diagnose()` function
can be called from devtools on pomofocus.io to log what DOM structures are found.

## Local Development
1. `chrome://extensions` → enable Developer mode
2. "Load unpacked" → select this directory
3. Open Options → configure Trello credentials → select board → set list names
4. Navigate to pomofocus.io → click extension icon → Sync

## Updating Selectors
If tasks aren't being read or added correctly:
1. Open pomofocus.io devtools console
2. Run: `(function(){ const s=document.createElement('script'); /* see diagnose in pomofocus-content.js */ })()`
3. Or inspect elements manually and update `SELECTORS` in `pomofocus-content.js`

---

<!-- claude-code-essentials -->
## Essentials (from claude-code-essentials)
<!-- Rules below are managed by the template. Do not remove the marker above. -->


## Git workflow
- Every change starts with a GitHub issue. Run `/new-issue` before branching.
- Branch naming: `feat/issue-{N}-{slug}` | `fix/issue-{N}-{slug}` | `chore/{slug}` | `docs/{slug}`
- Commits: Conventional Commits — `type(scope): description` (imperative mood)
  Valid types: feat, fix, chore, docs, refactor, test, ci, perf
- Never push directly to `main`. All changes go through a PR.
- Every PR must include `Closes #N` in the body. Delete branch after merge.

## Slash commands
| Command | Purpose |
|---|---|
| `/new-issue` | Draft and create a GitHub issue interactively |
| `/feature` | Create `feat/issue-{N}-{slug}` branch from main |
| `/fix` | Create `fix/issue-{N}-{slug}` branch from main |
| `/sync` | List open issues grouped by milestone and priority |

## Code quality
- Tests are part of done — no PR merges without passing tests.
- Remove all debug artifacts before opening a PR.
- Justify any new dependency in the PR body.

## Token efficiency (inherits from global — key reminders)
- Prefer `gh` CLI over MCP for all GitHub operations.
- Read file sections with offset/limit, not whole files.
- Delegate large outputs (test runs, logs) to a subagent.
