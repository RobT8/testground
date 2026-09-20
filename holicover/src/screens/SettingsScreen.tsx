import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { BackupError, exportData, importData, wipeAllData } from '../db/backup';
import { listHolidays } from '../db/holidays';
import { getSetting, setSetting } from '../db/settings';
import {
  DEFAULT_REMINDER_DAYS,
  cancelAllReminders,
  remindersSupported,
  rescheduleReminders,
} from '../utils/notifications';
import { getThemePreference, setThemePreference, type ThemePreference } from '../utils/theme';
import { downloadBackup } from '../utils/share';

const REMINDER_KEY = 'reminder_days';
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const PRIVACY_URL = 'https://holicover.app/privacy';
const TERMS_URL = 'https://holicover.app/terms';
const SUPPORT_EMAIL = 'support@holicover.app';
const PLAY_STORE_URL = 'market://details?id=com.holicover.app';

export default function SettingsScreen() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const [reminderDays, setReminderDays] = useState(DEFAULT_REMINDER_DAYS);
  const [status, setStatus] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSetting(REMINDER_KEY).then((saved) => {
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed >= 0) setReminderDays(parsed);
    });
  }, []);

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    setThemePreference(value);
  }

  async function changeReminder(value: number) {
    setReminderDays(value);
    await setSetting(REMINDER_KEY, String(value));

    const result = await rescheduleReminders(value, await listHolidays());
    switch (result.status) {
      case 'scheduled':
        setStatus({
          kind: 'ok',
          text: result.count === 0 ? 'No upcoming holidays to remind you about yet.' : `${result.count} reminder${result.count === 1 ? '' : 's'} set.`,
        });
        break;
      case 'off':
        setStatus({ kind: 'ok', text: 'Reminders turned off.' });
        break;
      case 'denied':
        setStatus({ kind: 'bad', text: 'Notifications are blocked. Turn them on in your phone’s settings.' });
        break;
      case 'unsupported':
        setStatus({ kind: 'ok', text: 'Reminders only work in the installed app.' });
        break;
      case 'error':
        setStatus({ kind: 'bad', text: `Could not set reminders: ${result.message}` });
        break;
    }
  }

  async function handleExport() {
    setBusy(true);
    setStatus(null);
    try {
      const file = await exportData();
      const result = await downloadBackup(file);
      setStatus(
        result.shared
          ? { kind: 'ok', text: `Backup ready — ${result.filename}` }
          : { kind: 'ok', text: `Saved ${result.filename}` },
      );
    } catch (error) {
      setStatus({ kind: 'bad', text: `Export failed: ${(error as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setStatus(null);
    try {
      const restored = await importData(JSON.parse(await file.text()));
      setStatus({
        kind: 'ok',
        text: `Restored ${restored.children.length} children and ${restored.holidays.length} holidays. Reopening…`,
      });
      // Everything on screen was read from the old data; restart cleanly.
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setStatus({
        kind: 'bad',
        text:
          error instanceof BackupError
            ? error.message
            : 'That file could not be read. It may not be a HoliCover backup.',
      });
      setBusy(false);
    }
  }

  async function handleWipe() {
    setConfirmWipe(false);
    setBusy(true);
    await cancelAllReminders();
    await wipeAllData();
    // Onboarding state was read at launch, so a reload is the clean reset.
    window.location.reload();
  }

  function openUrl(url: string) {
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="screen">
      <header className="home-header">
        <div>
          <p className="page-eyebrow">HoliCover</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </header>

      {status && (
        <p className={status.kind === 'bad' ? 'form-error' : 'form-success'} role="status">
          {status.text}
        </p>
      )}

      <section className="settings-group">
        <h2 className="settings-group__title">Appearance</h2>
        <div className="setting-row">
          <span className="setting-row__label">Theme</span>
          <div className="segmented segmented--inline">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  theme === option.value
                    ? 'segmented__option segmented__option--active'
                    : 'segmented__option'
                }
                aria-pressed={theme === option.value}
                onClick={() => chooseTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="settings-group__title">Reminders</h2>
        <div className="setting-row">
          <span className="setting-row__label">
            Remind me before a holiday
            {!remindersSupported() && (
              <span className="setting-row__sub">Only works in the installed app</span>
            )}
          </span>
          <select
            className="field__input setting-row__control"
            value={reminderDays}
            aria-label="Days before a holiday to remind me"
            onChange={(event) => changeReminder(Number(event.target.value))}
          >
            <option value={0}>Off</option>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="settings-group__title">Backup</h2>
        <button type="button" className="setting-row setting-row--action" disabled={busy} onClick={handleExport}>
          <span className="setting-row__label">
            Export a backup
            <span className="setting-row__sub">Saves everything as a JSON file</span>
          </span>
          <span className="setting-row__chevron">›</span>
        </button>
        <button
          type="button"
          className="setting-row setting-row--action"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <span className="setting-row__label">
            Restore from a backup
            <span className="setting-row__sub">Replaces everything on this phone</span>
          </span>
          <span className="setting-row__chevron">›</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={handleImportFile}
        />
      </section>

      <section className="settings-group">
        <h2 className="settings-group__title">HoliCover Pro</h2>
        <button type="button" className="setting-row setting-row--action setting-row--accent" disabled>
          <span className="setting-row__label">
            Upgrade to Pro
            <span className="setting-row__sub">Unlimited children and holidays, cost totals, exports — coming soon</span>
          </span>
        </button>
      </section>

      <section className="settings-group">
        <h2 className="settings-group__title">About</h2>
        <button type="button" className="setting-row setting-row--action" onClick={() => openUrl(PLAY_STORE_URL)}>
          <span className="setting-row__label">Rate this app</span>
          <span className="setting-row__chevron">›</span>
        </button>
        <button type="button" className="setting-row setting-row--action" onClick={() => openUrl(`mailto:${SUPPORT_EMAIL}`)}>
          <span className="setting-row__label">Contact support</span>
          <span className="setting-row__chevron">›</span>
        </button>
        <button type="button" className="setting-row setting-row--action" onClick={() => openUrl(PRIVACY_URL)}>
          <span className="setting-row__label">Privacy policy</span>
          <span className="setting-row__chevron">›</span>
        </button>
        <button type="button" className="setting-row setting-row--action" onClick={() => openUrl(TERMS_URL)}>
          <span className="setting-row__label">Terms of service</span>
          <span className="setting-row__chevron">›</span>
        </button>
        <div className="setting-row">
          <span className="setting-row__label">Version</span>
          <span className="setting-row__value">{__APP_VERSION__}</span>
        </div>
      </section>

      <section className="settings-group">
        <button
          type="button"
          className="setting-row setting-row--action setting-row--danger"
          disabled={busy}
          onClick={() => setConfirmWipe(true)}
        >
          <span className="setting-row__label">Delete all data</span>
        </button>
      </section>

      {confirmWipe && (
        <ConfirmDialog
          title="Delete all data"
          message="This removes every child, carer, holiday and plan from this phone. If you have not exported a backup, this cannot be undone."
          confirmLabel="Delete everything"
          onConfirm={handleWipe}
          onCancel={() => setConfirmWipe(false)}
        />
      )}
    </div>
  );
}
