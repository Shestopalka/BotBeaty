export type ThemeName = 'dusty_rose' | 'dark_rose' | 'blush_glass' | 'deep_mauve' | 'rose_noir';

interface ThemeVars {
  '--tg-theme-bg-color': string;
  '--tg-theme-secondary-bg-color': string;
  '--tg-theme-text-color': string;
  '--tg-theme-hint-color': string;
  '--tg-theme-button-color': string;
  '--tg-theme-button-text-color': string;
  '--tg-theme-link-color': string;
  '--theme-glow-color': string;
  '--theme-shadow': string;
  '--theme-btn-shadow': string;
  '--theme-pill-bg': string;
}

export const THEMES: Record<ThemeName, { label: string; description: string; preview: string; dark: boolean; vars: ThemeVars }> = {
  dusty_rose: {
    label: 'Dusty Rose',
    description: 'Кремовий · ніжний · денний',
    preview: '#D4537E',
    dark: false,
    vars: {
      '--tg-theme-bg-color': '#fff8f9',
      '--tg-theme-secondary-bg-color': '#fbeaf0',
      '--tg-theme-text-color': '#4b1528',
      '--tg-theme-hint-color': '#b07888',
      '--tg-theme-button-color': '#d4537e',
      '--tg-theme-button-text-color': '#ffffff',
      '--tg-theme-link-color': '#993556',
      '--theme-glow-color': 'rgba(212,83,126,0.18)',
      '--theme-shadow': '0 8px 32px rgba(212,83,126,0.18), 0 2px 8px rgba(212,83,126,0.08)',
      '--theme-btn-shadow': '0 4px 16px rgba(212,83,126,0.45)',
      '--theme-pill-bg': 'rgba(212,83,126,0.1)',
    },
  },
  dark_rose: {
    label: 'Dark Rose',
    description: 'Темний · гламурний · вечірній',
    preview: '#e8748a',
    dark: true,
    vars: {
      '--tg-theme-bg-color': '#1a0a0e',
      '--tg-theme-secondary-bg-color': '#2d1018',
      '--tg-theme-text-color': '#fdf0f2',
      '--tg-theme-hint-color': '#f9c6d0',
      '--tg-theme-button-color': '#e8748a',
      '--tg-theme-button-text-color': '#ffffff',
      '--tg-theme-link-color': '#f9c6d0',
      '--theme-glow-color': 'rgba(232,116,138,0.18)',
      '--theme-shadow': '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(232,116,138,0.15)',
      '--theme-btn-shadow': '0 4px 20px rgba(232,116,138,0.5)',
      '--theme-pill-bg': 'rgba(253,240,242,0.08)',
    },
  },
  blush_glass: {
    label: 'Blush Glass',
    description: 'Білий · скло · повітряний',
    preview: '#c84070',
    dark: false,
    vars: {
      '--tg-theme-bg-color': '#fff0f4',
      '--tg-theme-secondary-bg-color': 'rgba(255,255,255,0.7)',
      '--tg-theme-text-color': '#3d0f20',
      '--tg-theme-hint-color': '#c84070',
      '--tg-theme-button-color': '#c84070',
      '--tg-theme-button-text-color': '#ffffff',
      '--tg-theme-link-color': '#a03058',
      '--theme-glow-color': 'rgba(255,150,180,0.25)',
      '--theme-shadow': '0 12px 40px rgba(220,100,140,0.2), 0 2px 8px rgba(220,100,140,0.1)',
      '--theme-btn-shadow': '0 4px 18px rgba(200,64,112,0.45)',
      '--theme-pill-bg': 'rgba(255,255,255,0.6)',
    },
  },
  deep_mauve: {
    label: 'Deep Mauve',
    description: 'Глибокий · пурпур · розкіш',
    preview: '#c860a8',
    dark: true,
    vars: {
      '--tg-theme-bg-color': '#150810',
      '--tg-theme-secondary-bg-color': '#200d1a',
      '--tg-theme-text-color': '#f5e0ee',
      '--tg-theme-hint-color': '#e8a0c8',
      '--tg-theme-button-color': '#c860a8',
      '--tg-theme-button-text-color': '#ffffff',
      '--tg-theme-link-color': '#e8a0c8',
      '--theme-glow-color': 'rgba(190,80,150,0.2)',
      '--theme-shadow': '0 8px 36px rgba(0,0,0,0.6), 0 2px 8px rgba(180,80,140,0.2)',
      '--theme-btn-shadow': '0 4px 20px rgba(200,96,168,0.55)',
      '--theme-pill-bg': 'rgba(245,224,238,0.07)',
    },
  },
  rose_noir: {
    label: 'Rosé Noir',
    description: 'Чорний · рожеве золото · преміум',
    preview: '#d4806a',
    dark: true,
    vars: {
      '--tg-theme-bg-color': '#0e0a0c',
      '--tg-theme-secondary-bg-color': '#1a1014',
      '--tg-theme-text-color': '#faeae0',
      '--tg-theme-hint-color': '#e8b090',
      '--tg-theme-button-color': '#d4806a',
      '--tg-theme-button-text-color': '#ffffff',
      '--tg-theme-link-color': '#e8b090',
      '--theme-glow-color': 'rgba(220,140,120,0.14)',
      '--theme-shadow': '0 8px 36px rgba(0,0,0,0.7), 0 2px 8px rgba(220,160,140,0.15)',
      '--theme-btn-shadow': '0 4px 18px rgba(212,128,106,0.5)',
      '--theme-pill-bg': 'rgba(250,234,224,0.07)',
    },
  },
};

export function applyTheme(name: ThemeName) {
  const theme = THEMES[name] ?? THEMES.dusty_rose;

  // Вставляємо змінні через <style !important> — це єдиний надійний спосіб
  // перемогти Telegram SDK, який теж пише в document.documentElement.style.
  // За CSS каскадом: author !important > inline style (style.setProperty).
  let styleEl = document.getElementById('bb-theme') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bb-theme';
    document.head.appendChild(styleEl);
  }
  const cssVars = Object.entries(theme.vars)
    .map(([k, v]) => `  ${k}: ${v} !important;`)
    .join('\n');
  styleEl.textContent = `:root {\n${cssVars}\n}`;

  try {
    localStorage.setItem('beatybot_theme', name);
  } catch (_) {
    // localStorage може бути недоступний у Telegram WebView — ігноруємо
  }
}

export function getSavedTheme(): ThemeName {
  try {
    return (localStorage.getItem('beatybot_theme') as ThemeName) ?? 'dusty_rose';
  } catch (_) {
    return 'dusty_rose';
  }
}
