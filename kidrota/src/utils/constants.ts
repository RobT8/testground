/** Carer categories. Drives the colour of every cell in the weekly grid. */
export type CarerType = 'parent' | 'family' | 'club' | 'playdate' | 'other';

/** Slot within a day when a holiday is in `simple` mode. */
export type Period = 'am' | 'pm' | 'all_day';

/** How a holiday is planned: AM/PM halves, or explicit time ranges. */
export type HolidayMode = 'simple' | 'detailed';

/** CSS custom-property pair for each carer type, plus the unassigned "gap" look. */
export const CARER_TYPE_VARS: Record<CarerType | 'gap', { bg: string; text: string }> = {
  family: { bg: 'var(--carer-family-bg)', text: 'var(--carer-family-text)' },
  club: { bg: 'var(--carer-club-bg)', text: 'var(--carer-club-text)' },
  parent: { bg: 'var(--carer-parent-bg)', text: 'var(--carer-parent-text)' },
  playdate: { bg: 'var(--carer-playdate-bg)', text: 'var(--carer-playdate-text)' },
  other: { bg: 'var(--carer-other-bg)', text: 'var(--carer-other-text)' },
  gap: { bg: 'var(--carer-gap-bg)', text: 'var(--carer-gap-text)' },
};

/** Human labels for carer types, used by the Carers screen grouping. */
export const CARER_TYPE_LABELS: Record<CarerType, string> = {
  family: 'Family',
  club: 'Clubs & camps',
  parent: 'Parents',
  playdate: 'Playdates',
  other: 'Other',
};

/** Tappable presets offered during onboarding. */
export const DEFAULT_CARERS: { name: string; short_name: string; type: CarerType }[] = [
  { name: 'Mum', short_name: 'Mum', type: 'parent' },
  { name: 'Dad', short_name: 'Dad', type: 'parent' },
  { name: 'Grandma', short_name: 'Gran', type: 'family' },
  { name: 'Grandad', short_name: 'Gramps', type: 'family' },
  { name: 'Holiday club', short_name: 'Club', type: 'club' },
  { name: 'Playdate', short_name: 'Play', type: 'playdate' },
  { name: 'Childminder', short_name: 'CM', type: 'other' },
  { name: 'Au pair', short_name: 'Au pair', type: 'other' },
];

/** Colour choices offered when adding a child. */
export const CHILD_COLOURS = [
  '#378ADD',
  '#E2725B',
  '#5FA85F',
  '#B266C9',
  '#E8A33D',
  '#3FA9A0',
];

/** Key used in the app_settings table to skip onboarding on later launches. */
export const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

/** Free-tier caps. Lifted by the Pro unlock. */
export const FREE_TIER_MAX_CHILDREN = 2;
export const FREE_TIER_MAX_HOLIDAYS = 2;

/**
 * Outward-facing links and addresses, kept together so there is one place to
 * change them.
 *
 * The legal pages are served by GitHub Pages from the docs/ folder at the
 * repository root. Google Play requires the privacy policy URL to be publicly
 * reachable before the app can be published.
 */
export const SUPPORT_EMAIL = 'support@kidrota.app';
export const PRIVACY_URL = 'https://robt8.github.io/testground/privacy.html';
export const TERMS_URL = 'https://robt8.github.io/testground/terms.html';
export const PLAY_STORE_URL = 'market://details?id=com.kidrota.app';
