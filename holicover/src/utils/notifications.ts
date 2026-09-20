import { Capacitor } from '@capacitor/core';
import type { Holiday } from '../db/types';
import { parseISODate, todayISO } from './dates';

/** Notifications fire at 9am local time — morning of, not middle of the night. */
const REMINDER_HOUR = 9;

export const DEFAULT_REMINDER_DAYS = 7;

export function remindersSupported(): boolean {
  // The plugin is native-only; the browser build has no equivalent.
  return Capacitor.isNativePlatform();
}

export type ReminderResult =
  | { status: 'scheduled'; count: number }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

/**
 * Replace all scheduled reminders with one per upcoming holiday.
 *
 * Always clears first: the alternative is duplicate notifications every time
 * the setting is touched, and there is no way for a user to clear those.
 */
export async function rescheduleReminders(
  days: number,
  holidays: Holiday[],
): Promise<ReminderResult> {
  if (!remindersSupported()) return { status: 'unsupported' };

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    if (days <= 0) return { status: 'off' };

    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return { status: 'denied' };

    const now = new Date();
    const today = todayISO();
    const notifications = holidays
      .filter((holiday) => holiday.start_date >= today)
      .map((holiday) => {
        const at = parseISODate(holiday.start_date);
        at.setDate(at.getDate() - days);
        at.setHours(REMINDER_HOUR, 0, 0, 0);
        return { holiday, at };
      })
      // A reminder whose moment has passed would fire immediately.
      .filter((item) => item.at.getTime() > now.getTime())
      .map((item) => ({
        id: item.holiday.id,
        title: item.holiday.name,
        body:
          days === 1
            ? 'Starts tomorrow. Any gaps left to fill?'
            : `Starts in ${days} days. Any gaps left to fill?`,
        schedule: { at: item.at },
      }));

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
    return { status: 'scheduled', count: notifications.length };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

/** Remove every scheduled reminder, e.g. after wiping all data. */
export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch {
    // Nothing useful to do if the platform refuses; reminders simply stay.
  }
}
