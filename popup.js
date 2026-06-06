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

function setBothDisabled(active) {
  btnSync.disabled = active;
  btnSyncState.disabled = active;
}

function setSyncing(active) {
  setBothDisabled(active);
  syncLabel.textContent = active ? 'Syncing…' : 'Sync to Pomofocus';
  syncSpinner.classList.toggle('hidden', !active);
}

function setSyncingState(active) {
  setBothDisabled(active);
  syncStateLabel.textContent = active ? 'Syncing…' : 'Sync State';
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

// ── Trello API (called directly — popup has host_permissions for api.trello.com) ──

async function fetchTrelloCards(apiKey, token, boardId, includeLists, { includeDone = false } = {}) {
  const auth = `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;

  const listsRes = await fetch(
    `https://api.trello.com/1/boards/${boardId}/lists?${auth}&filter=open&fields=id,name`
  );
  if (!listsRes.ok) {
    const body = await listsRes.text().catch(() => '');
    throw new Error(`Trello lists API error ${listsRes.status}: ${body.slice(0, 100)}`);
  }
  const lists = await listsRes.json();

  const includeSet = new Set(includeLists.map(n => n.toLowerCase().trim()));
  const targetLists = lists.filter(l => includeSet.has(l.name.toLowerCase().trim()));

  if (targetLists.length === 0) {
    const available = lists.map(l => `"${l.name}"`).join(', ');
    throw new Error(
      `No lists matched [${includeLists.map(n => `"${n}"`).join(', ')}]. ` +
      `Available lists: ${available || 'none'}`
    );
  }

  const cardArrays = await Promise.all(
    targetLists.map(list =>
      fetch(
        `https://api.trello.com/1/lists/${list.id}/cards` +
        `?${auth}&filter=open&fields=name,desc,due,dueComplete`
      ).then(r => {
        if (!r.ok) throw new Error(`Cards API error ${r.status} for list "${list.name}"`);
        return r.json();
      })
    )
  );

  return cardArrays
    .flat()
    .filter(card => includeDone || !card.dueComplete)
    .map(card => ({
      id: card.id,
      name: card.name.trim(),
      desc: (card.desc || '').trim(),
      dueComplete: !!card.dueComplete,
    }))
    .filter(card => card.name.length > 0);
}

async function markCardsDone(apiKey, token, cardIds) {
  const auth = `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
  const results = await Promise.allSettled(
    cardIds.map(async id => {
      const r = await fetch(`https://api.trello.com/1/cards/${id}?${auth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueComplete: true }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} for card ${id}: ${body.slice(0, 120)}`);
      }
    })
  );
  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message || 'unknown error');
  return {
    succeeded: results.filter(r => r.status === 'fulfilled').length,
    failed: errors.length,
    errors,
  };
}

// ── Sync to Pomofocus (forward sync) ──────────────────────────────────────────

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

    const listNames = (includeLists || 'To Do,In Progress')
      .split(',').map(s => s.trim()).filter(Boolean);

    const cards = await fetchTrelloCards(apiKey, token, boardId, listNames);

    if (cards.length === 0) {
      showStatus('No cards found in the configured lists.', 'info');
      return;
    }

    const tabs = await chrome.tabs.query({ url: '*://pomofocus.io/*' });
    if (tabs.length === 0) {
      showStatus('Please open pomofocus.io in a tab first.', 'error');
      return;
    }

    let syncResult;
    try {
      syncResult = await chrome.tabs.sendMessage(tabs[0].id, { action: 'SYNC_TASKS', tasks: cards });
    } catch {
      showStatus('Could not reach pomofocus.io. Please refresh that tab and try again.', 'error');
      return;
    }

    if (!syncResult?.success) {
      showStatus(syncResult?.error || 'Sync failed. Check pomofocus.io console for details.', 'error');
      return;
    }

    await chrome.storage.local.set({ trelloCardMap: buildCardMap(cards) });

    const { added, skipped } = syncResult;
    const parts = [];
    if (added > 0) parts.push(`${added} task${added !== 1 ? 's' : ''} added`);
    if (skipped > 0) parts.push(`${skipped} skipped (duplicate)`);
    if (added === 0 && skipped === 0) parts.push('Nothing to sync');

    showStatus(parts.join(' · '), 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    setSyncing(false);
  }
});

// ── Sync State (bidirectional — Trello done ↔ Pomofocus done) ─────────────────

btnSyncState.addEventListener('click', async () => {
  clearStatus();
  setSyncingState(true);

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

    // Fetch all cards (done + not done) and read Pomofocus done-tasks in parallel.
    const [cards, doneResult] = await Promise.all([
      fetchTrelloCards(apiKey, token, boardId, listNames, { includeDone: true }),
      chrome.tabs.sendMessage(pomofocusTab.id, { action: 'GET_DONE_TASKS' })
        .then(r => r ?? { success: false, doneNames: [] })
        .catch(() => ({ success: false, doneNames: [] })),
    ]);

    await chrome.storage.local.set({ trelloCardMap: buildCardMap(cards.filter(c => !c.dueComplete)) });

    const trelloDoneNames = new Set(cards.filter(c => c.dueComplete).map(c => normalizeCardName(c.name)));
    const pomofocusDoneNames = new Set(doneResult.success ? doneResult.doneNames : []);

    const nameToId = Object.fromEntries(cards.map(c => [normalizeCardName(c.name), c.id]));
    const toMarkInTrello    = [...pomofocusDoneNames].filter(n => !trelloDoneNames.has(n) && nameToId[n]);
    const toMarkInPomofocus = [...trelloDoneNames].filter(n => !pomofocusDoneNames.has(n));

    if (toMarkInTrello.length === 0 && toMarkInPomofocus.length === 0) {
      showStatus('States are already in sync.', 'success');
      return;
    }

    const [markTrelloResult, markPomofocusResult] = await Promise.all([
      toMarkInTrello.length > 0
        ? markCardsDone(apiKey, token, toMarkInTrello.map(n => nameToId[n]))
        : { succeeded: 0, failed: 0, errors: [] },
      toMarkInPomofocus.length > 0
        ? chrome.tabs.sendMessage(pomofocusTab.id, { action: 'MARK_TASKS_DONE', names: toMarkInPomofocus })
            .then(r => r ?? { success: true, marked: 0 })
            .catch(err => ({ success: false, error: err.message }))
        : { success: true, marked: 0 },
    ]);

    const parts = [];
    if (markTrelloResult.succeeded > 0)
      parts.push(`${markTrelloResult.succeeded} marked done in Trello`);
    if (markTrelloResult.failed > 0)
      parts.push(`${markTrelloResult.failed} Trello failed — ${markTrelloResult.errors[0]}`);
    if (markPomofocusResult.marked > 0)
      parts.push(`${markPomofocusResult.marked} marked done in Pomofocus`);
    if (!markPomofocusResult.success)
      parts.push(`Pomofocus error: ${markPomofocusResult.error}`);

    const hasError = markTrelloResult.failed > 0 || !markPomofocusResult.success;
    showStatus(parts.join(' · '), hasError ? 'error' : 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    setSyncingState(false);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCardName(name) {
  const display = name.length > 100 ? name.slice(0, 97) + '…' : name;
  return display.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCardMap(cards) {
  const map = {};
  for (const card of cards) {
    map[normalizeCardName(card.name)] = card.id;
    const orig = card.name.trim().toLowerCase().replace(/\s+/g, ' ');
    map[orig] = card.id;
  }
  return map;
}

init();
