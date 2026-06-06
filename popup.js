const viewSetup = document.getElementById('view-setup');
const viewMain = document.getElementById('view-main');
const displayBoard = document.getElementById('display-board');
const displayLists = document.getElementById('display-lists');
const btnSync = document.getElementById('btn-sync');
const btnOpenOptions = document.getElementById('btn-open-options');
const linkSettings = document.getElementById('link-settings');
const syncLabel = document.getElementById('sync-label');
const syncSpinner = document.getElementById('sync-spinner');
const statusBox = document.getElementById('status-box');

function showStatus(msg, type = 'info') {
  statusBox.textContent = msg;
  statusBox.className = `status-box ${type}`;
  statusBox.classList.remove('hidden');
}

function clearStatus() {
  statusBox.classList.add('hidden');
  statusBox.className = 'status-box hidden';
}

function setSyncing(active) {
  btnSync.disabled = active;
  syncLabel.textContent = active ? 'Syncing…' : 'Sync';
  syncSpinner.classList.toggle('hidden', !active);
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

btnOpenOptions.addEventListener('click', openOptions);
linkSettings.addEventListener('click', (e) => { e.preventDefault(); openOptions(); });

async function init() {
  const { apiKey, token, boardId, boardName, includeLists } = await chrome.storage.sync.get([
    'apiKey', 'token', 'boardId', 'boardName', 'includeLists',
  ]);

  if (!apiKey || !token || !boardId) {
    viewSetup.classList.remove('hidden');
    return;
  }

  displayBoard.textContent = boardName || boardId;
  displayLists.textContent = includeLists || 'To Do, In Progress';
  viewMain.classList.remove('hidden');
}

btnSync.addEventListener('click', async () => {
  clearStatus();
  setSyncing(true);

  try {
    const { apiKey, token, boardId, includeLists } = await chrome.storage.sync.get([
      'apiKey', 'token', 'boardId', 'includeLists',
    ]);

    if (!apiKey || !token || !boardId) {
      showStatus('Missing Trello credentials. Open Settings.', 'error');
      return;
    }

    const tabs = await chrome.tabs.query({ url: '*://pomofocus.io/*' });
    if (tabs.length === 0) {
      showStatus('Please open pomofocus.io in a tab first.', 'error');
      return;
    }
    const pomofocusTab = tabs[0];

    const listNames = (includeLists || 'To Do,In Progress')
      .split(',').map(s => s.trim()).filter(Boolean);

    // Fetch Trello cards and read Pomofocus done-tasks in parallel.
    const [fetchResult, doneResult] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'FETCH_CARDS', apiKey, token, boardId, includeLists: listNames }),
      chrome.tabs.sendMessage(pomofocusTab.id, { action: 'GET_DONE_TASKS' }).catch(() => null),
    ]);

    if (!fetchResult.success) {
      showStatus(`Trello error: ${fetchResult.error}`, 'error');
      return;
    }

    const { cards } = fetchResult;

    // Build name→id map and persist it for future use.
    const trelloCardMap = {};
    for (const card of cards) {
      const normalized = card.name.trim().toLowerCase().replace(/\s+/g, ' ');
      const displayName = card.name.length > 100 ? card.name.slice(0, 97) + '…' : card.name;
      const displayNormalized = displayName.trim().toLowerCase().replace(/\s+/g, ' ');
      trelloCardMap[displayNormalized] = card.id;
      trelloCardMap[normalized] = card.id;
    }
    await chrome.storage.local.set({ trelloCardMap });

    // Resolve which done Pomofocus tasks map to Trello card IDs.
    const doneNames = doneResult?.success ? doneResult.doneNames : [];
    const doneCardIds = [...new Set(
      doneNames.map(name => trelloCardMap[name]).filter(Boolean)
    )];

    // Write to both sides in parallel: add new tasks to Pomofocus, mark done cards in Trello.
    const [syncResult, markResult] = await Promise.all([
      cards.length > 0
        ? chrome.tabs.sendMessage(pomofocusTab.id, { action: 'SYNC_TASKS', tasks: cards }).catch(err => ({ success: false, error: err.message }))
        : Promise.resolve({ success: true, added: 0, skipped: 0 }),
      doneCardIds.length > 0
        ? chrome.runtime.sendMessage({ action: 'MARK_CARDS_DONE', apiKey, token, cardIds: doneCardIds })
        : Promise.resolve({ success: true, succeeded: 0, failed: 0, errors: [] }),
    ]);

    const parts = [];

    if (!syncResult.success) {
      parts.push(`Pomofocus error: ${syncResult.error}`);
    } else {
      const { added, skipped } = syncResult;
      if (added > 0) parts.push(`${added} task${added !== 1 ? 's' : ''} added`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
    }

    if (markResult.succeeded > 0) parts.push(`${markResult.succeeded} marked done in Trello`);
    if (markResult.failed > 0) parts.push(`${markResult.failed} failed — ${markResult.errors[0]}`);

    if (parts.length === 0) parts.push('Everything is up to date');

    const hasError = !syncResult.success || markResult.failed > 0;
    showStatus(parts.join(' · '), hasError ? 'error' : 'success');
  } catch (err) {
    showStatus(`Unexpected error: ${err.message}`, 'error');
  } finally {
    setSyncing(false);
  }
});

init();
