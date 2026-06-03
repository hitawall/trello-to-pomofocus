chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'FETCH_CARDS') {
    fetchTrelloCards(message.apiKey, message.token, message.boardId, message.includeLists)
      .then(cards => sendResponse({ success: true, cards }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});

async function fetchTrelloCards(apiKey, token, boardId, includeLists) {
  const auth = `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;

  // Fetch all open lists on the board
  const listsRes = await fetch(
    `https://api.trello.com/1/boards/${boardId}/lists?${auth}&filter=open&fields=id,name`
  );
  if (!listsRes.ok) {
    const body = await listsRes.text().catch(() => '');
    throw new Error(`Trello lists API error ${listsRes.status}: ${body.slice(0, 100)}`);
  }
  const lists = await listsRes.json();

  // Filter to the configured list names (case-insensitive, trimmed)
  const includeSet = new Set(includeLists.map(n => n.toLowerCase().trim()));
  const targetLists = lists.filter(l => includeSet.has(l.name.toLowerCase().trim()));

  if (targetLists.length === 0) {
    const available = lists.map(l => `"${l.name}"`).join(', ');
    throw new Error(
      `No lists matched [${includeLists.map(n => `"${n}"`).join(', ')}]. ` +
      `Available lists: ${available || 'none'}`
    );
  }

  // Fetch open (non-archived) cards from each matching list in parallel.
  // Also request dueComplete so we can exclude cards the user has already checked off.
  const cardRequests = targetLists.map(list =>
    fetch(
      `https://api.trello.com/1/lists/${list.id}/cards` +
      `?${auth}&filter=open&fields=name,desc,due,dueComplete`
    ).then(r => {
      if (!r.ok) throw new Error(`Cards API error ${r.status} for list "${list.name}"`);
      return r.json();
    })
  );

  const cardArrays = await Promise.all(cardRequests);

  return cardArrays
    .flat()
    .filter(card => !card.dueComplete)   // exclude cards marked complete via due-date checkbox
    .map(card => ({
      name: card.name.trim(),
      desc: (card.desc || '').trim(),
    }))
    .filter(card => card.name.length > 0);
}
