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
  syncLabel.textContent = active ? 'Syncing…' : 'Sync to Pomofocus';
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

init();
