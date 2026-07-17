export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  main() {
    console.info('[vanguard] content script alive on', location.hostname);
  },
});
