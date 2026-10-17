// Theme before first paint: the saved choice, else the system preference.
try { const t = localStorage.getItem('atlas-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* storage blocked */ }
