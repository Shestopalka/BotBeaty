import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useMaster } from '../../context/MasterContext';

// Контакт для оплати, поки немає платіжного провайдера (впиши свій Telegram).
const PAY_CONTACT_URL: string = '';

const FEATURES = [
  'Власний бот для запису',
  'Розклад і керування слотами',
  'Картки клієнтів і теги',
  'Автоматичні нагадування',
  'Аналітика доходів',
];

interface Plan {
  id: string; name: string; months: number; perMonth: number; total: number;
  badge?: string; highlight?: boolean;
}

const PLANS: Plan[] = [
  { id: 'starter', name: 'Стартер', months: 1,  perMonth: 250, total: 250 },
  { id: 'pro',     name: 'Про',     months: 3,  perMonth: 225, total: 675, badge: '−10%' },
  { id: 'year',    name: 'Рік',     months: 12, perMonth: 200, total: 2400, badge: 'Найвигідніше · −20%', highlight: true },
];

type Mode = 'welcome' | 'locked' | 'manage';

export function BillingPage({ mode = 'manage', onRefresh }: { mode?: Mode; onRefresh?: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const { master } = useMaster();
  const [checking, setChecking] = useState(false);

  const trialDays = master?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(master.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 14;

  function choose(plan: Plan) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    if (PAY_CONTACT_URL) {
      const tg: any = window.Telegram?.WebApp;
      if (tg?.openTelegramLink && PAY_CONTACT_URL.includes('t.me')) tg.openTelegramLink(PAY_CONTACT_URL);
      else window.open(PAY_CONTACT_URL, '_blank');
    } else {
      const tg: any = window.Telegram?.WebApp;
      tg?.showAlert?.(`Щоб активувати «${plan.name}» (${plan.total} ₴) — звʼяжіться з нами для оплати.`);
    }
  }

  async function recheck() {
    if (!onRefresh) return;
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-10" style={{ background: 'var(--tg-theme-bg-color)' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-center" style={{ color: 'var(--tg-theme-text-color)' }}>
          {mode === 'locked' ? 'Оберіть план' : 'Тарифи'}
        </h1>
        <p className="text-sm text-center mt-1 mb-6" style={{ color: 'var(--tg-theme-hint-color)' }}>
          {mode === 'locked'
            ? 'Пробний період завершено. Щоб бот приймав записи — оберіть план.'
            : 'Усі функції включені в кожен план. Що довший період — то дешевший місяць.'}
        </p>

        {/* Тріал — підсвічений після реєстрації */}
        {mode === 'welcome' && (
          <div className="rounded-2xl p-4 mb-6 border-2"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', borderColor: 'var(--tg-theme-button-color)', boxShadow: 'var(--theme-shadow)' }}>
            <div className="flex items-center justify-between">
              <p className="font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>Пробний період активний</p>
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }}>
                14 днів безкоштовно
              </span>
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Залишилось {trialDays} дн. Користуйтесь усіма можливостями — план обереш пізніше.
            </p>
            <button onClick={() => navigate('/master/home')}
              className="w-full mt-3 py-3 rounded-2xl font-semibold"
              style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
              Перейти в кабінет
            </button>
          </div>
        )}

        {/* Плани */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PLANS.map((p) => (
            <div key={p.id} className="rounded-2xl p-5 flex flex-col"
              style={{
                background: 'var(--tg-theme-secondary-bg-color)',
                border: p.highlight ? '2px solid var(--tg-theme-button-color)' : '0.5px solid var(--theme-glow-color)',
                boxShadow: p.highlight ? 'var(--theme-shadow)' : 'none',
              }}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>{p.name}</p>
                {p.badge && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-link-color)' }}>{p.badge}</span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>{p.perMonth} ₴</span>
                <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>/ міс</span>
              </div>
              <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--tg-theme-hint-color)' }}>
                {p.months === 1 ? 'щомісяця' : `${p.total} ₴ за ${p.months} міс`}
              </p>
              <div className="flex flex-col gap-1.5 flex-1 mb-4">
                {FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <Check size={14} style={{ color: 'var(--tg-theme-button-color)' }} strokeWidth={2.5} />
                    <span className="text-xs" style={{ color: 'var(--tg-theme-text-color)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => choose(p)}
                className="w-full py-3 rounded-2xl font-semibold text-sm"
                style={p.highlight
                  ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }
                  : { background: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-button-color)', border: '1.5px solid var(--tg-theme-button-color)' }}>
                Обрати
              </button>
            </div>
          ))}
        </div>

        {mode === 'locked' && (
          <button onClick={recheck} disabled={checking}
            className="w-full mt-6 py-3 rounded-2xl font-medium text-sm"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)', opacity: checking ? 0.6 : 1 }}>
            {checking ? 'Перевіряємо…' : 'Я оплатив — перевірити'}
          </button>
        )}
      </div>
    </div>
  );
}
