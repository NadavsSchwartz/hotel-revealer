import React, { useEffect, useLayoutEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      if (!document.documentElement.dataset.themeChoice) setTheme(preference.matches ? 'dark' : 'light');
    };
    followSystem();
    preference.addEventListener('change', followSystem);
    return () => preference.removeEventListener('change', followSystem);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.themeChoice = next;
    setTheme(next);
    try {
      localStorage.setItem('hotel-revealer-theme', next);
    } catch {
      // Keep the choice for this visit even when storage is unavailable.
    }
  };
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : <path d="M20.3 14.3A8.5 8.5 0 0 1 9.7 3.7a8.5 8.5 0 1 0 10.6 10.6Z" />}
      </svg>
    </button>
  );
}
