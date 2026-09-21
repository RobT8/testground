import type { CarerType } from '../utils/constants';

/** Line icons keyed to carer type, so the picker reads at a glance. */
export default function CarerIcon({ type, size = 18 }: { type: CarerType; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (type) {
    case 'family': // heart
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.4 12 20 12 20Z" />
        </svg>
      );
    case 'parent': // home
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'club': // running figure
      return (
        <svg {...common}>
          <circle cx="14" cy="4.5" r="1.8" />
          <path d="M9 21l2.5-5 3-2-1-4.5" />
          <path d="M13.5 9.5 10 11l-1.5 3" />
          <path d="M14.5 12.5 18 15l1 5" />
        </svg>
      );
    case 'playdate': // two friends
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="2.6" />
          <circle cx="16" cy="9" r="2.1" />
          <path d="M3.5 19c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6" />
          <path d="M14.5 14.8c2.4-.4 6 .9 6 4.2" />
        </svg>
      );
    default: // person
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6" />
        </svg>
      );
  }
}
