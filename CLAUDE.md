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
