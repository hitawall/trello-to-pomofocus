# Trello → Pomofocus

A Chrome extension that syncs your pending Trello cards into [pomofocus.io](https://pomofocus.io) as Pomodoro tasks — with duplicate detection so re-syncing never creates duplicates.

![Extension popup](icons/icon128.png)

---

## How it works

1. You pick a Trello board and configure which lists count as "pending" (e.g. `To Do, In Progress`)
2. Click **Sync to Pomofocus** in the extension popup
3. The extension fetches open, non-completed cards from those lists and adds any that aren't already in your pomofocus task list
4. Re-syncing is safe — tasks already in pomofocus are skipped

---

## Local Installation

### Prerequisites
- Google Chrome (or any Chromium-based browser)
- A [Trello](https://trello.com) account
- A [pomofocus.io](https://pomofocus.io) account (free)

### Steps

**1. Download the extension**

Clone or download this repository to your machine:
```bash
git clone https://github.com/hitawall/trello-to-pomofocus.git
```

**2. Load it in Chrome**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `trello-to-pomofocus` folder

The tomato icon will appear in your Chrome toolbar. Pin it for easy access.

**3. First-time setup**

Click the extension icon → **Open Settings** (or right-click the icon → *Options*).

**Step 1 — Trello API Key**
- Go to [trello.com/app-key](https://trello.com/app-key) and copy your API key
- Paste it into the **Trello API Key** field

**Step 2 — Authorize**
- Click **Open Trello Authorization Page** — a new tab opens on Trello
- Click **Allow** on the Trello page
- Trello shows your token on screen — copy it
- Paste the token into the **Paste your Trello token here** field
- Click **Confirm Token** — you'll see your Trello name if it worked

**Step 3 — Select your board**
- Click **Load Boards** and choose the board you want to sync from

**Step 4 — Configure list names**
- Enter the list names to include, comma-separated (default: `To Do, In Progress`)
- Matching is case-insensitive

- Click **Save Settings**

**4. Daily usage**

1. Open [pomofocus.io](https://pomofocus.io) and make sure you're logged in
2. Click the 🍅 extension icon in your toolbar
3. Click **Sync to Pomofocus**
4. The popup will show how many tasks were added and how many were skipped as duplicates

> **Tip:** You can sync as many times as you want — tasks already in pomofocus are always skipped.

### Updating the extension

When you pull new changes from the repo, reload the extension:
1. Go to `chrome://extensions`
2. Click the **↻ refresh** icon on the Trello to Pomofocus card
3. Refresh any open pomofocus.io tabs

---

## Publishing to the Chrome Web Store

### Prerequisites
- A [Google Developer account](https://developer.chrome.com/docs/webstore/register/) ($5 one-time registration fee)
- All extension files ready (no build step needed — this is plain JS)

### Step 1 — Prepare the package

Zip the extension folder (exclude `.git`, `node_modules`, and any test files):

```bash
cd trello-to-pomofocus
zip -r ../trello-to-pomofocus.zip . \
  --exclude "*.git*" \
  --exclude "*.DS_Store" \
  --exclude "*node_modules*"
```

### Step 2 — Review store requirements

Before submitting, make sure:

- [ ] `manifest.json` has a clear `name`, `description`, and `version`
- [ ] Icons are present at all three sizes: 16×16, 48×48, 128×128 px
- [ ] The extension only requests permissions it actually uses (`storage`, `tabs`)
- [ ] `host_permissions` are limited to what's needed (`pomofocus.io`, `api.trello.com`)
- [ ] No remote code execution (all JS is bundled locally) ✅
- [ ] Privacy policy URL ready (required if you handle user data — Trello tokens are stored locally via `chrome.storage.sync`, which Chrome encrypts)

### Step 3 — Create store listing assets

You'll need:
| Asset | Size | Notes |
|---|---|---|
| Store icon | 128×128 px | Already in `icons/icon128.png` |
| Screenshots | 1280×800 or 640×400 px | At least 1, up to 5 |
| Promotional tile (optional) | 440×280 px | Shown on the store homepage |
| Description | Up to 132 chars (short) + long description | |

### Step 4 — Submit

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item** → upload your `.zip`
3. Fill in the store listing (description, screenshots, category: *Productivity*)
4. Under **Privacy** — declare that the extension stores Trello API credentials locally
5. Set **Distribution**: *Public* or *Unlisted* (unlisted = anyone with the link can install, no review wait)
6. Click **Submit for Review**

### Step 5 — Wait for review

- Review typically takes **1–3 business days** for new extensions
- You'll receive an email when it's approved or if changes are requested
- Common rejection reasons: overly broad permissions, missing privacy policy, unclear description

### Updating after publishing

Bump the `version` in `manifest.json`, re-zip, and upload the new package in the Developer Dashboard. Updates go live automatically after a shorter review (~a few hours).

---

## Troubleshooting

**"Could not find the + Add Task area"**
→ Make sure you're logged in to pomofocus.io and the task list is visible on screen.

**"You are not logged in to pomofocus.io"**
→ Sign in to pomofocus.io in the same browser window, then try again.

**"Trello lists API error 401"**
→ Your token may have expired. Go to Settings, re-authorize with Trello, and save.

**Tasks not being skipped as duplicates**
→ Reload the pomofocus.io tab, then sync again.

**Sync only includes some lists**
→ Check your list names in Settings. Names must exactly match (case-insensitive) the list names on your Trello board.
