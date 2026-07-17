export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  main() {
    console.info('[vanguard] content script alive on', location.hostname);

    // TEMPORARY dev hook for manual smoke-testing the L2 scan end to end (removed in Phase 3 —
    // see .superpowers/sdd/task-3-report.md for the console steps). Not wired to any UI.
    (window as unknown as { __vgScan: (t: string) => Promise<unknown> }).__vgScan = (t: string) =>
      chrome.runtime.sendMessage({ kind: 'l2-scan', id: '1', text: t });
  },
});
