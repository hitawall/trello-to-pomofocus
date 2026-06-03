const inputApiKey    = document.getElementById('input-apikey');
const btnAuthorize   = document.getElementById('btn-authorize');
const tokenPasteArea = document.getElementById('token-paste-area');
const inputToken     = document.getElementById('input-token');
const btnConfirm     = document.getElementById('btn-confirm-token');
const tokenStatus    = document.getElementById('token-status');
const selectBoard    = document.getElementById('select-board');
const btnLoadBoards  = document.getElementById('btn-load-boards');
const inputLists     = document.getElementById('input-lists');
const btnSave        = document.getElementById('btn-save');
const btnTest        = document.getElementById('btn-test');
const saveStatus     = document.getElementById('save-status');

let currentApiKey = '';
let currentToken  = '';

// ─── Status helpers ────────────────────────────────────────────────────────────

function showTokenStatus(msg, type) {
  tokenStatus.textContent = msg;
  tokenStatus.className = `token-status ${type}`;
  tokenStatus.classList.remove('hidden');
}

function showSaveStatus(msg, type) {
  saveStatus.textContent = msg;
  saveStatus.className = `save-status ${type}`;
  saveStatus.classList.remove('hidden');
  if (type === 'success') setTimeout(() => saveStatus.classList.add('hidden'), 3000);
}

function updateButtonStates() {
  const hasApiKey = inputApiKey.value.trim().length > 0;
  const hasToken  = currentToken.length > 0;
  const hasBoard  = selectBoard.value.length > 0;

  btnAuthorize.disabled = !hasApiKey;
  btnLoadBoards.disabled = !hasToken;
  selectBoard.disabled   = !hasToken;
  btnSave.disabled  = !(hasApiKey && hasToken && hasBoard);
  btnTest.disabled  = !(hasApiKey && hasToken && hasBoard);
}

inputApiKey.addEventListener('input', () => {
  currentApiKey = inputApiKey.value.trim();
  updateButtonStates();
});

// ─── Step 1: Open Trello auth page, then paste token ──────────────────────────

btnAuthorize.addEventListener('click', () => {
  const apiKey = inputApiKey.value.trim();
  if (!apiKey) return;

  // Open the Trello auth page WITHOUT a return_url.
  // Trello will show the token directly on screen after the user approves.
  const authUrl =
    `https://trello.com/1/authorize` +
    `?expiration=never` +
    `&scope=read` +
    `&response_type=token` +
    `&name=TrelloPomofocus` +
    `&key=${encodeURIComponent(apiKey)}`;

  chrome.tabs.create({ url: authUrl });

  // Show the paste area
  tokenPasteArea.classList.remove('hidden');
  inputToken.focus();
});

// Confirm the pasted token
btnConfirm.addEventListener('click', async () => {
  const token = inputToken.value.trim();
  if (!token) {
    showTokenStatus('Please paste your token first.', 'error');
    return;
  }

  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Verifying…';

  try {
    // Quick validation: hit the /members/me endpoint
    const res = await fetch(
      `https://api.trello.com/1/members/me?key=${encodeURIComponent(currentApiKey)}&token=${encodeURIComponent(token)}&fields=fullName`
    );
    if (!res.ok) throw new Error(`Trello returned ${res.status} — check your token and API key`);
    const member = await res.json();

    currentToken = token;
    await chrome.storage.sync.set({ token });
    tokenPasteArea.classList.add('hidden');
    showTokenStatus(`✓ Authorized as ${member.fullName}`, 'success');
    await loadBoards();
  } catch (err) {
    showTokenStatus(`Token invalid: ${err.message}`, 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Confirm Token';
    updateButtonStates();
  }
});

// ─── Step 2: Load boards ───────────────────────────────────────────────────────

btnLoadBoards.addEventListener('click', loadBoards);

async function loadBoards() {
  if (!currentToken || !currentApiKey) return;

  btnLoadBoards.disabled = true;
  btnLoadBoards.textContent = 'Loading…';
  selectBoard.disabled = true;

  try {
    const res = await fetch(
      `https://api.trello.com/1/members/me/boards` +
      `?key=${encodeURIComponent(currentApiKey)}&token=${encodeURIComponent(currentToken)}` +
      `&filter=open&fields=id,name`
    );
    if (!res.ok) throw new Error(`Trello API returned ${res.status}`);
    const boards = await res.json();

    selectBoard.innerHTML = '<option value="">— Select a board —</option>';
    boards
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(board => {
        const opt = document.createElement('option');
        opt.value = board.id;
        opt.textContent = board.name;
        selectBoard.appendChild(opt);
      });

    const { boardId } = await chrome.storage.sync.get('boardId');
    if (boardId) selectBoard.value = boardId;

  } catch (err) {
    showSaveStatus(`Failed to load boards: ${err.message}`, 'error');
  } finally {
    btnLoadBoards.disabled = false;
    btnLoadBoards.textContent = 'Load Boards';
    selectBoard.disabled = false;
    updateButtonStates();
  }
}

selectBoard.addEventListener('change', updateButtonStates);

// ─── Save ──────────────────────────────────────────────────────────────────────

btnSave.addEventListener('click', async () => {
  const apiKey     = inputApiKey.value.trim();
  const boardId    = selectBoard.value;
  const boardName  = selectBoard.options[selectBoard.selectedIndex]?.text || '';
  const includeLists = inputLists.value.trim() || 'To Do, In Progress';

  if (!apiKey || !currentToken || !boardId) {
    showSaveStatus('Please complete all steps before saving.', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiKey, token: currentToken, boardId, boardName, includeLists });
  showSaveStatus('Settings saved!', 'success');
});

// ─── Test connection ───────────────────────────────────────────────────────────

btnTest.addEventListener('click', async () => {
  btnTest.disabled = true;
  btnTest.textContent = 'Testing…';

  try {
    const apiKey    = inputApiKey.value.trim();
    const boardId   = selectBoard.value;
    const listNames = (inputLists.value || 'To Do, In Progress')
      .split(',').map(s => s.trim()).filter(Boolean);

    const result = await chrome.runtime.sendMessage({
      action: 'FETCH_CARDS',
      apiKey,
      token: currentToken,
      boardId,
      includeLists: listNames,
    });

    if (!result.success) throw new Error(result.error);
    showSaveStatus(
      `Found ${result.cards.length} card${result.cards.length !== 1 ? 's' : ''} across ${listNames.length} list${listNames.length !== 1 ? 's' : ''}`,
      'info'
    );
  } catch (err) {
    showSaveStatus(`Test failed: ${err.message}`, 'error');
  } finally {
    btnTest.disabled = false;
    btnTest.textContent = 'Test Connection';
    updateButtonStates();
  }
});

// ─── Init: restore saved settings ─────────────────────────────────────────────

async function init() {
  const { apiKey, token, boardId, includeLists } = await chrome.storage.sync.get([
    'apiKey', 'token', 'boardId', 'includeLists',
  ]);

  if (apiKey) {
    inputApiKey.value = apiKey;
    currentApiKey = apiKey;
  }

  if (token) {
    currentToken = token;
    // Verify the saved token is still valid
    try {
      const res = await fetch(
        `https://api.trello.com/1/members/me?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&fields=fullName`
      );
      const member = res.ok ? await res.json() : null;
      showTokenStatus(
        member ? `✓ Authorized as ${member.fullName}` : '✓ Token saved (could not verify — offline?)',
        'success'
      );
    } catch {
      showTokenStatus('✓ Token saved', 'success');
    }
  }

  if (includeLists) inputLists.value = includeLists;

  updateButtonStates();

  if (apiKey && token) {
    await loadBoards();
    if (boardId) selectBoard.value = boardId;
    updateButtonStates();
  }
}

init();
