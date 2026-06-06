// Service worker — kept minimal.
// Trello API calls moved to popup.js (host_permissions covers api.trello.com there too),
// avoiding the MV3 service-worker message-port-closes-before-sendResponse race condition.
