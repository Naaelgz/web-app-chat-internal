try {
  document.documentElement.dataset.theme =
    localStorage.getItem('akselera-theme') === 'dark' ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}