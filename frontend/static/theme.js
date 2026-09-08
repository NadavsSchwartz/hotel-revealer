// Vite copies this static asset unchanged; run it before styles and the application.
(() => {
  let choice;
  try {
    choice = localStorage.getItem('hotel-revealer-theme');
  } catch {
    // The system theme still works when browser storage is unavailable.
  }
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.themeChoice = choice;
  root.dataset.theme = root.dataset.themeChoice || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();
