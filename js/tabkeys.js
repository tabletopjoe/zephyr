// =====================================================================
// Tab hotkeys: the number keys 1–9 switch tabs. A page in a tab has the
// keyboard while it's showing, so each page loads this to pass number
// keys up to the shell (index.html), which does the switching. A message
// rather than a direct call, so it works opened straight from disk too.
// =====================================================================
addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return; // typing, not switching
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m && parent !== window) parent.postMessage({ zephyrTab: Number(m[1]) }, "*");
});
