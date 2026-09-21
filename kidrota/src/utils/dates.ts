/**
 * Date helpers.
 *
 * Every date in the database is a plain ISO day string (YYYY-MM-DD) with no
 * time or zone — a holiday on the 21st is the 21st wherever the phone is.
 * These helpers deliberately never touch UTC: `new Date('2026-10-21')` parses
 * as UTC midnight and reads back as the 20th anywhere west of Greenwich, which
 * would shift the whole planner by a day.
 */

/** Parse an ISO day string into a local-midnight Date. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date as an ISO day string using its local calendar date. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Day of week for an ISO date. 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getDay();
}

export function isWeekend(iso: string): boolean {
  const day = dayOfWeek(iso);
  return day === 0 || day === 6;
}

/** Add days to an ISO date, returning a new ISO date. */
export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from `from` to `to`; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  // Round rather than floor: DST changes make some "days" 23 or 25 hours long.
  return Math.round(ms / 86_400_000);
}

/** Every date from `start` to `end` inclusive. */
export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const total = daysBetween(start, end);
  for (let i = 0; i <= total; i++) dates.push(addDays(start, i));
  return dates;
}

/** The dates a holiday actually covers, honouring its weekend setting. */
export function getHolidayDates(holiday: {
  start_date: string;
  end_date: string;
  exclude_weekends: number;
}): string[] {
  const dates = datesInRange(holiday.start_date, holiday.end_date);
  return holiday.exclude_weekends ? dates.filter((date) => !isWeekend(date)) : dates;
}

/**
 * Split dates into the weeks the planner pages through, each starting on a
 * Monday. Excluded weekends simply leave gaps, so a week never splits oddly.
 */
export function groupIntoWeeks(dates: string[]): string[][] {
  if (dates.length === 0) return [];

  const weeks: string[][] = [];
  let current: string[] = [];
  let weekStart: string | null = null;

  for (const date of dates) {
    // Monday-based index: Sunday (0) belongs to the week that began 6 days ago.
    const mondayOffset = (dayOfWeek(date) + 6) % 7;
    const monday = addDays(date, -mondayOffset);

    if (monday !== weekStart) {
      if (current.length > 0) weeks.push(current);
      current = [];
      weekStart = monday;
    }
    current.push(date);
  }
  if (current.length > 0) weeks.push(current);
  return weeks;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Mon 21" — the weekly grid column header. */
export function formatColumnHeader(iso: string): string {
  const date = parseISODate(iso);
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`;
}

/** "Friday 25 Oct" — the day assignment screen title. */
export function formatLongDate(iso: string): string {
  const date = parseISODate(iso);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    date.getDay()
  ];
  return `${weekday} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** "21–25 Oct 2026" or "28 Dec 2026 – 2 Jan 2027" — the holiday card subtitle. */
export function formatDateRange(start: string, end: string): string {
  const from = parseISODate(start);
  const to = parseISODate(end);
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  if (sameMonth) {
    return `${from.getDate()}–${to.getDate()} ${MONTH_SHORT[to.getMonth()]} ${to.getFullYear()}`;
  }
  const fromPart = `${from.getDate()} ${MONTH_SHORT[from.getMonth()]}${sameYear ? '' : ` ${from.getFullYear()}`}`;
  return `${fromPart} – ${to.getDate()} ${MONTH_SHORT[to.getMonth()]} ${to.getFullYear()}`;
}

/** Today as an ISO day string, in the phone's local calendar. */
export function todayISO(): string {
  return toISODate(new Date());
}
