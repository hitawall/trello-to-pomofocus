const viewSetup = document.getElementById('view-setup');
const viewMain = document.getElementById('view-main');
const displayBoard = document.getElementById('display-board');
const displayLists = document.getElementById('display-lists');
const btnSync = document.getElementById('btn-sync');
const btnSyncState = document.getElementById('btn-sync-state');
const btnOpenOptions = document.getElementById('btn-open-options');
const linkSettings = document.getElementById('link-settings');
const syncLabel = document.getElementById('sync-label');
const syncSpinner = document.getElementById('sync-spinner');
const syncStateLabel = document.getElementById('sync-state-label');
const syncStateSpinner = document.getElementById('sync-state-spinner');
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
  btnSyncState.disabled = active;
  syncLabel.textContent = active ? 'Syncing…' : 'Sync to Pomofocus';
  syncSpinner.classList.toggle('hidden', !active);
}

function setSyncingState(active) {
  btnSyncState.disabled = active;
  btnSync.disabled = active;
  syncStateLabel.textContent = active ? 'Syncing State…' : 'Sync State to Trello';
  syncStateSpinner.classList.toggle('hidden', !active);
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
    // 1. Load config
    const { apiKey, token, boardId, includeLists } = await chrome.storage.sync.get([
      'apiKey', 'token', 'boardId', 'includeLists',
    ]);

    if (!apiKey || !token || !boardId) {
      showStatus('Missing Trello credentials. Open Settings.', 'error');
      return;
    }

    // 2. Fetch cards from Trello (via background service worker)
    const listNames = (includeLists || 'To Do,In Progress')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const fetchResult = await chrome.runtime.sendMessage({
      action: 'FETCH_CARDS',
      apiKey,
      token,
      boardId,
      includeLists: listNames,
    });

    if (!fetchResult.success) {
      showStatus(`Trello error: ${fetchResult.error}`, 'error');
      return;
    }

    const { cards } = fetchResult;

    if (cards.length === 0) {
      showStatus('No cards found in the configured lists.', 'info');
      return;
    }

    // 3. Find pomofocus.io tab
    const tabs = await chrome.tabs.query({ url: '*://pomofocus.io/*' });

    if (tabs.length === 0) {
      showStatus('Please open pomofocus.io in a tab first.', 'error');
      return;
    }

    const pomofocusTab = tabs[0];

    // 4. Send tasks to content script
    let syncResult;
    try {
      syncResult = await chrome.tabs.sendMessage(pomofocusTab.id, {
        action: 'SYNC_TASKS',
        tasks: cards,
      });
    } catch (err) {
      showStatus('Could not reach pomofocus.io. Please refresh that tab and try again.', 'error');
      return;
    }

    if (!syncResult || !syncResult.success) {
      showStatus(syncResult?.error || 'Sync failed. Check pomofocus.io console for details.', 'error');
      return;
    }

    // Persist name→id map so "Sync State" can look up card IDs by normalised name.
    const trelloCardMap = {};
    for (const card of cards) {
      const normalized = card.name.trim().toLowerCase().replace(/\s+/g, ' ');
      // Use the same truncation applied when adding to Pomofocus (100 char limit).
      const displayName = card.name.length > 100 ? card.name.slice(0, 97) + '…' : card.name;
      const displayNormalized = displayName.trim().toLowerCase().replace(/\s+/g, ' ');
      trelloCardMap[displayNormalized] = card.id;
      // Also store under the original name so direct matches work even without truncation.
      trelloCardMap[normalized] = card.id;
    }
    await chrome.storage.local.set({ trelloCardMap });

    const { added, skipped } = syncResult;
    const parts = [];
    if (added > 0) parts.push(`${added} task${added !== 1 ? 's' : ''} added`);
    if (skipped > 0) parts.push(`${skipped} skipped (duplicate)`);
    if (added === 0 && skipped === 0) parts.push('Nothing to sync');

    showStatus(parts.join(' · '), 'success');
  } catch (err) {
    showStatus(`Unexpected error: ${err.message}`, 'error');
  } finally {
    setSyncing(false);
  }
});

btnSyncState.addEventListener('click', async () => {
  clearStatus();
  setSyncingState(true);

  try {
    const { apiKey, token, trelloCardMap } = await chrome.storage.local.get(['trelloCardMap'])
      .then(local => chrome.storage.sync.get(['apiKey', 'token']).then(sync => ({ ...sync, ...local })));

    if (!apiKey || !token) {
      showStatus('Missing Trello credentials. Open Settings.', 'error');
      return;
    }

    if (!trelloCardMap || Object.keys(trelloCardMap).length === 0) {
      showStatus('No card map found. Run "Sync to Pomofocus" first.', 'info');
      return;
    }

    // Get done tasks from the Pomofocus tab.
    const tabs = await chrome.tabs.query({ url: '*://pomofocus.io/*' });
    if (tabs.length === 0) {
      showStatus('Please open pomofocus.io in a tab first.', 'error');
      return;
    }

    let doneResult;
    try {
      doneResult = await chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_DONE_TASKS' });
    } catch {
      showStatus('Could not reach pomofocus.io. Please refresh that tab and try again.', 'error');
      return;
    }

    if (!doneResult?.success) {
      showStatus(doneResult?.error || 'Could not read done tasks from pomofocus.io.', 'error');
      return;
    }

    const { doneNames } = doneResult;
    if (doneNames.length === 0) {
      showStatus('No completed tasks found in Pomofocus.', 'info');
      return;
    }

    // Match done task names to Trello card IDs.
    const cardIds = [...new Set(
      doneNames
        .map(name => trelloCardMap[name])
        .filter(Boolean)
    )];

    if (cardIds.length === 0) {
      showStatus(`${doneNames.length} done task${doneNames.length !== 1 ? 's' : ''} found but none matched Trello cards. Try syncing to Pomofocus first.`, 'info');
      return;
    }

    const markResult = await chrome.runtime.sendMessage({
      action: 'MARK_CARDS_DONE',
      apiKey,
      token,
      cardIds,
    });

    if (!markResult.success) {
      showStatus(`Trello error: ${markResult.error}`, 'error');
      return;
    }

    const { succeeded, failed } = markResult;
    const parts = [];
    if (succeeded > 0) parts.push(`${succeeded} card${succeeded !== 1 ? 's' : ''} marked done`);
    if (failed > 0) parts.push(`${failed} failed`);
    showStatus(parts.join(' · '), succeeded > 0 ? 'success' : 'error');
  } catch (err) {
    showStatus(`Unexpected error: ${err.message}`, 'error');
  } finally {
    setSyncingState(false);
  }
});

init();
