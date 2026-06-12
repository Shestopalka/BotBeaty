/**
 * Власні SVG-ілюстрації (без емодзі). Лінійні, ніжні, успадковують колір теми
 * через currentColor — задаєш color на батьку, і ілюстрація фарбується.
 */
type IllustrationName =
  | 'calendar'
  | 'slots'
  | 'clients'
  | 'services'
  | 'appointments'
  | 'sparkle';

export function Illustration({
  name,
  size = 96,
  className,
}: {
  name: IllustrationName;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 96 96',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="18" y="22" width="60" height="54" rx="12" opacity="0.9" />
          <path d="M18 38h60" />
          <path d="M34 16v12M62 16v12" />
          <circle cx="48" cy="56" r="9" opacity="0.5" />
          <path d="M48 51v5l3 3" />
        </svg>
      );
    case 'slots':
      return (
        <svg {...common}>
          <circle cx="48" cy="50" r="28" opacity="0.9" />
          <path d="M48 34v16l11 7" />
          <path d="M48 14v6M82 50h-6M14 50h6" opacity="0.4" />
        </svg>
      );
    case 'clients':
      return (
        <svg {...common}>
          <circle cx="38" cy="40" r="12" opacity="0.9" />
          <path d="M20 74c0-11 8-18 18-18s18 7 18 18" opacity="0.9" />
          <circle cx="66" cy="36" r="9" opacity="0.45" />
          <path d="M62 56c10-1 18 6 18 16" opacity="0.45" />
        </svg>
      );
    case 'services':
      return (
        <svg {...common}>
          <circle cx="34" cy="32" r="8" opacity="0.9" />
          <circle cx="34" cy="64" r="8" opacity="0.9" />
          <path d="M40 38l34 34M40 58l34-34" opacity="0.6" />
          <circle cx="70" cy="48" r="4" opacity="0.5" />
        </svg>
      );
    case 'appointments':
      return (
        <svg {...common}>
          <rect x="20" y="20" width="56" height="58" rx="12" opacity="0.9" />
          <path d="M32 40h32M32 52h32M32 64h20" opacity="0.55" />
          <path d="M62 30l6 6 12-12" opacity="0.9" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M48 22c2 13 7 18 20 20-13 2-18 7-20 20-2-13-7-18-20-20 13-2 18-7 20-20Z" opacity="0.9" />
          <path d="M74 60c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8Z" opacity="0.5" />
        </svg>
      );
  }
}
