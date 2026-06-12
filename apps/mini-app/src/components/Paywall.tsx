import { useState } from 'react';
import { Illustration } from './Illustration';

// Вартість підписки. Зміни тут, якщо тариф інший.
export const PLAN_PRICE_UAH = 250;
// Контакт для оплати (поки немає платіжки) — впиши свій Telegram, напр. 'https://t.me/your_username'.
const PAY_CONTACT_URL: string = '';

export function Paywall({
  status,
  onRefresh,
}: {
  status?: 'past_due' | 'canceled';
  onRefresh: () => Promise<void> | void;
}) {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  }

  function pay() {
    if (!PAY_CONTACT_URL) return;
    const tg: any = window.Telegram?.WebApp;
    if (tg?.openTelegramLink && PAY_CONTACT_URL.includes('t.me')) tg.openTelegramLink(PAY_CONTACT_URL);
    else window.open(PAY_CONTACT_URL, '_blank');
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-4"
      style={{ background: 'var(--tg-theme-bg-color)' }}>
      <span style={{ color: 'var(--tg-theme-button-color)', opacity: 0.85 }}>
        <Illustration name="sparkle" size={84} />
      </span>

      <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
        {status === 'canceled' ? 'Підписку призупинено' : 'Продовжіть підписку'}
      </h1>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Пробний період завершено. Щоб бот і далі приймав записи, потрібна активна підписка.
      </p>

      <div className="w-full rounded-2xl p-4 my-2"
        style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
        <p className="text-3xl font-bold" style={{ color: 'var(--tg-theme-button-color)' }}>
          {PLAN_PRICE_UAH} ₴ <span className="text-base font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>/ місяць</span>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
          Тариф «Стандарт» · усі можливості кабінету
        </p>
      </div>

      {PAY_CONTACT_URL && (
        <button onClick={pay}
          className="w-full py-4 rounded-2xl font-semibold text-base"
          style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
          Оплатити
        </button>
      )}

      <button onClick={check} disabled={checking}
        className="w-full py-3 rounded-2xl font-medium text-sm"
        style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)', opacity: checking ? 0.6 : 1 }}>
        {checking ? 'Перевіряємо…' : 'Я оплатив — перевірити'}
      </button>

      <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Після підтвердження оплати доступ відновиться.
      </p>
    </div>
  );
}
