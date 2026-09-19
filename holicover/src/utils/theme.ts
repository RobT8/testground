export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'holicover.theme';

/** What the user picked. `system` means "follow the OS". */
export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve a preference to the concrete theme the CSS should use. */
function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light';
  return preference;
}

function apply(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolve(preference);
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
  apply(preference);
}

/**
 * Apply the stored theme and keep it in sync with the OS while the preference
 * is `system`. Call once on startup.
 */
export function initTheme(): void {
  apply(getThemePreference());
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getThemePreference() === 'system') apply('system');
    });
}
