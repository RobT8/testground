const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT = '#1A1A1A';

/**
 * Pick the more legible text colour for a coloured background.
 *
 * Comparing both candidates beats thresholding on luminance: the child colour
 * presets all sit in the mid range, where a plausible-looking threshold picks
 * white even though dark text is clearly better — on the amber it is 8.1:1
 * against 2.2:1, which fails WCAG AA outright.
 */
export function textOn(background: string): string {
  return contrast(background, DARK_TEXT) >= contrast(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/** WCAG contrast ratio between two colours, from 1:1 to 21:1. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  if (!Number.isFinite(int) || value.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** First letter of a name, for avatars. Falls back to "?" for a blank name. */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}
