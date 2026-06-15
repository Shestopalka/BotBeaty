import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

/**
 * Аватар майстра. Джерело: власне фото (avatarUrl), інакше — проксі аватара
 * з Telegram (/masters/:id/avatar). Якщо нічого не завантажилось — ініціали.
 */
export function Avatar({
  name,
  masterId,
  avatarUrl,
  size = 96,
  fontSize,
}: {
  name?: string;
  masterId?: string;
  avatarUrl?: string | null;
  size?: number;
  fontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = avatarUrl || (masterId ? `${API_BASE}/masters/${masterId}/avatar` : '');
  const dimension = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        onError={() => setFailed(true)}
        className="rounded-full object-cover"
        style={dimension}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold"
      style={{
        ...dimension,
        background: 'var(--theme-pill-bg)',
        color: 'var(--tg-theme-button-color)',
        fontSize: fontSize ?? Math.round(size / 2.6),
      }}
    >
      {(name?.[0] ?? '✦').toUpperCase()}
    </div>
  );
}
