// Restore the visual theme independently of the Original light/dark preference.
// Original remains the default and keeps its existing atlas-theme storage key.
(() => {
  let visual = 'original', originalMode = null;
  try {
    if (localStorage.getItem('atlas-visual-theme') === 'liquid-aurora') visual = 'liquid-aurora';
    const saved = localStorage.getItem('atlas-theme');
    if (saved === 'light' || saved === 'dark') originalMode = saved;
  } catch { /* storage blocked: Original follows the system */ }
  document.documentElement.dataset.visualTheme = visual;
  if (visual === 'liquid-aurora') document.documentElement.dataset.theme = 'dark';
  else if (originalMode) document.documentElement.dataset.theme = originalMode;
})();
