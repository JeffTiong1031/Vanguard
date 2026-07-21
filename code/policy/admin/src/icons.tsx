/** Inline stroke icons (lucide-style geometry), so the console needs no icon
 *  font or remote asset — CSP-clean and offline-safe. currentColor throughout. */
import type { JSX } from 'preact';

const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
} as const;

type P = JSX.SVGAttributes<SVGSVGElement>;

export const LayersIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="m2 17 10 5 10-5" />
    <path d="m2 12 10 5 10-5" />
  </svg>
);

export const ShieldIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const InboxIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </svg>
);

export const BarIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 3v18h18" />
    <rect x="7" y="12" width="3" height="6" rx="1" />
    <rect x="12" y="8" width="3" height="10" rx="1" />
    <rect x="17" y="5" width="3" height="13" rx="1" />
  </svg>
);

export const KeyIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </svg>
);

export const GavelIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" />
    <path d="m16 16 6-6" /><path d="m8 8 6-6" />
    <path d="m9 7 8 8" /><path d="m21 11-8-8" />
  </svg>
);
