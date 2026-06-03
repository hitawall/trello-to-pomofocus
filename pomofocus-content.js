// Content script for pomofocus.io
// Reads existing tasks and injects new ones via DOM interaction.
// pomofocus.io is a React app — use native property setters to trigger
// synthetic events that React's reconciler picks up correctly.
//
// ── How pomofocus.io task-adding works (logged in) ──────────────────────────
// The main task list has an "+ Add Task" button at its bottom.
// Clicking it reveals an inline form with a text input and Save/Cancel buttons.
// The "+ Create New" button in the header is for TEMPLATES — do not use it.
// ────────────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTaskName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Set an input/textarea value in a way React's synthetic event system recognises. */
function setReactValue(element, value) {
  const proto = element.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Wait for a VISIBLE element matching the predicate fn, using MutationObserver. */
function waitForVisible(predicate, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const found = predicate();
    if (found) { resolve(found); return; }

    const observer = new MutationObserver(() => {
      const el = predicate();
      if (el) { observer.disconnect(); clearTimeout(timer); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timeout waiting for element to appear'));
    }, timeout);
  });
}

/** Find a VISIBLE button/div whose text includes `text` (case-insensitive). */
function findVisibleButtonByText(text) {
  const lower = text.toLowerCase();
  return Array.from(document.querySelectorAll('button, [role="button"]')).find(el => {
    if (!el.offsetParent) return false;
    const t = el.textContent?.trim().toLowerCase();
    return t && t.includes(lower);
  });
}

/**
 * Find the "+ Add Task" clickable element in the main task list.
 * pomofocus renders it as a <div> with an onclick handler (not a <button>),
 * so a standard button search misses it. We find the leaf <div> with text
 * "Add Task" that is visible and outside any open modal, then return its
 * clickable parent.
 */
function findAddTaskElement() {
  for (const el of document.querySelectorAll('*')) {
    if (!el.offsetParent) continue;
    if (el.children.length > 0) continue; // leaf nodes only
    const text = (el.innerText ?? el.textContent)?.trim();
    if (text !== 'Add Task') continue;
    // Skip if inside an open modal/dialog (e.g. the "Create Template" dialog)
    if (el.closest('[role="dialog"], [class*="modal"], [class*="Modal"]')) continue;
    // Return the parent — that's the element with the onclick React handler
    return el.parentElement ?? el;
  }
  return null;
}

/** Close any open modal/dialog by pressing Escape. */
function closeOpenModal() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
}

/** Returns true if the user appears to be logged into pomofocus. */
function isLoggedIn() {
  const signInBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.offsetParent !== null && b.textContent?.trim() === 'Sign In');
  return !signInBtn;
}

// ─── Read existing tasks ───────────────────────────────────────────────────────

function getExistingTaskNames() {
  const names = new Set();

  // Find the Tasks section heading, then scope the search to that section's container
  const tasksHeading = Array.from(document.querySelectorAll('span, h2, h3, div'))
    .find(el => el.textContent?.trim() === 'Tasks' && el.offsetParent !== null);

  const scope = tasksHeading?.closest('section, [class*="task"], div') || document.body;

  // Collect text from <p> and <span> elements in the task list area
  // Filter: text must be between 1 and 200 chars and not purely numeric
  scope.querySelectorAll('p, span').forEach(el => {
    // Skip elements that contain child elements (only leaf text nodes)
    if (el.children.length > 0) return;
    const text = el.textContent?.trim();
    if (text && text.length > 0 && text.length < 200 && !/^\d+$/.test(text)) {
      names.add(normalizeTaskName(text));
    }
  });

  return names;
}

// ─── Add a single task ─────────────────────────────────────────────────────────

async function addTask(name) {
  let addBtn = findAddTaskElement() ?? findVisibleButtonByText('Add Task');

  if (!addBtn) {
    // Add Task not visible — a modal may be blocking it. Close it and try once more.
    closeOpenModal();
    await sleep(100);
    addBtn = findAddTaskElement() ?? findVisibleButtonByText('Add Task');
  }

  if (!addBtn) {
    throw new Error(
      'Could not find the "+ Add Task" area. ' +
      'Make sure you are logged in to pomofocus.io and the task list is visible. ' +
      'Run window.__pf_diagnose() in the console for details.'
    );
  }

  addBtn.click();

  // waitForVisible uses MutationObserver so it reacts the moment the input appears —
  // no fixed sleep needed between the click and waiting.
  let input;
  try {
    input = await waitForVisible(() => {
      return Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'))
        .find(el => el.offsetParent !== null &&
          el.id !== 'input_profile_name' &&
          el.id !== 'imgupload' &&
          el.placeholder !== 'Search Tasks' &&
          el.placeholder !== 'https://example.com/webhook' &&
          el.placeholder !== 'example@email.com' &&
          el.placeholder !== 'Delete' &&
          el.type !== 'number' &&
          el.type !== 'date' &&
          el.type !== 'range' &&
          el.type !== 'file'
        );
    }, 5000);
  } catch {
    throw new Error(
      'Task name input did not appear after clicking Add Task. ' +
      'If a dialog opened, press Escape and try again. ' +
      'Run window.__pf_diagnose() for details.'
    );
  }

  // Form is fully rendered by the time waitForVisible resolves — set value immediately
  input.focus();
  setReactValue(input, name);

  const saveBtn = findVisibleButtonByText('Save');
  if (saveBtn) {
    saveBtn.click();
  } else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', keyCode: 13, bubbles: true }));
  }

  await waitForFormToClose(input);

  // After the form closes, React re-renders the task list before re-showing the Add Task div.
  // Wait for it to reappear so the next addTask() call can find it immediately.
  await waitForVisible(() => findAddTaskElement() ?? findVisibleButtonByText('Add Task'), 3000)
    .catch(() => {}); // non-fatal — next iteration will handle a missing button itself
}

// MutationObserver-based form-close detection — reacts instantly instead of polling every 100ms
function waitForFormToClose(inputEl, timeout = 3000) {
  return new Promise(resolve => {
    if (!document.contains(inputEl) || !inputEl.offsetParent) { resolve(); return; }

    const observer = new MutationObserver(() => {
      if (!document.contains(inputEl) || !inputEl.offsetParent) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const timer = setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
  });
}

// ─── Main sync handler ─────────────────────────────────────────────────────────

async function syncTasks(tasks) {
  if (!isLoggedIn()) {
    throw new Error(
      'You are not logged in to pomofocus.io. ' +
      'Please sign in and then try syncing again.'
    );
  }

  const existing = getExistingTaskNames();
  let added = 0;
  let skipped = 0;

  for (const task of tasks) {
    const normalized = normalizeTaskName(task.name);

    if (existing.has(normalized)) {
      skipped++;
      continue;
    }

    const taskName = task.name.length > 100 ? task.name.slice(0, 97) + '…' : task.name;

    await addTask(taskName);
    existing.add(normalized);
    added++;
  }

  return { added, skipped };
}

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SYNC_TASKS') {
    syncTasks(message.tasks)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Diagnostic helper ─────────────────────────────────────────────────────────
// Injected into the page's MAIN world so it's callable directly from DevTools console.

function runDiagnose() {
  console.group('[TrelloPomofocus] Diagnostic');
  console.log('Logged in:', isLoggedIn());

  const addBtn = findAddTaskElement() ?? findVisibleButtonByText('Add Task');
  console.log('"Add Task" element (main task list):', addBtn || 'NOT FOUND');

  const createNewBtn = findVisibleButtonByText('Create New');
  console.log('"Create New" button (templates — do NOT use for sync):', createNewBtn || 'not visible');

  const allVisibleBtns = Array.from(document.querySelectorAll('button'))
    .filter(b => b.offsetParent !== null)
    .map(b => b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30));
  console.log('All visible buttons:', allVisibleBtns);

  const existingTasks = [...getExistingTaskNames()];
  console.log(`Existing tasks read (${existingTasks.length}):`, existingTasks);
  console.log('Hint: If "Add Task" not found, log in to pomofocus.io and ensure the task list is visible.');
  console.groupEnd();
}

// Expose in the page's main world via a injected <script> tag so DevTools console can call it
const diagScript = document.createElement('script');
diagScript.textContent = `
  window.__pf_diagnose = function() {
    window.dispatchEvent(new CustomEvent('__pf_diagnose'));
  };
`;
(document.head || document.documentElement).appendChild(diagScript);
diagScript.remove();

window.addEventListener('__pf_diagnose', runDiagnose);

console.debug('[TrelloPomofocus] Content script loaded. Run window.__pf_diagnose() for debug info.');
