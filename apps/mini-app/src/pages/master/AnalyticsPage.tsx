import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { APP_TZ, fromKyiv, kyivIso, kyivNow } from '../../lib/time';
import { TrendingUp, TrendingDown, Users, Award, Wallet, Plus, Trash2, ChevronRight } from 'lucide-react';
import { analyticsApi, expensesApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { useUI } from '../../context/UIContext';
import { Illustration } from '../../components/Illustration';

function EmptyHint({ icon, text }: { icon: 'services' | 'clients' | 'calendar'; text: string }) {
  return (
    <div className="flex flex-col items-center py-6 gap-2">
      <span style={{ color: 'var(--tg-theme-button-color)', opacity: 0.75 }}>
        <Illustration name={icon} size={60} />
      </span>
      <p className="text-sm text-center" style={{ color: 'var(--tg-theme-hint-color)' }}>{text}</p>
    </div>
  );
}

interface DashboardStats {
  revenueThisMonth: number;
  expensesThisMonth: number;
  netIncomeThisMonth: number;
  appointmentsThisMonth: number;
  newClientsThisMonth: number;
  completionRate: number;
  revenueGrowth: number;
  appointmentsGrowth: number;
  topServices: { name: string; count: number; revenue: number }[];
  revenueByDay: { date: string; revenue: number; count: number }[];
  clientsByTag: { tag: string; count: number }[];
}

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  spentAt: string;
}

// Межі поточного місяця (ISO) — для журналу витрат і синхронізації з бекендом.
function monthRange(): { from: string; to: string } {
  // Місяць — київський, незалежно від поясу телефону.
  const now = kyivNow();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: kyivIso(from), to: new Date(fromKyiv(to).getTime() - 1).toISOString() };
}

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('uk-UA')} ₴`;
}

function fmtExpenseDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('uk-UA', { timeZone: APP_TZ, day: '2-digit', month: 'short' });
}

const TAG_LABELS: Record<string, string> = {
  new: 'Нові', regular: 'Постійні', trusted: 'Перевірені',
  blocked: 'Заблоковані', unwanted: 'Небажані',
};

function fmtDay(s?: string): string {
  if (!s) return '';
  const [, m, d] = s.slice(0, 10).split('-');
  return d && m ? `${d}.${m}` : s;
}

function GrowthBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
        positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {positive ? '+' : ''}{value}%
    </span>
  );
}

function StatCard({ label, value, sub, growth }: {
  label: string; value: string; sub?: string; growth?: number;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>{label}</p>
        {growth !== undefined && <GrowthBadge value={growth} />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>{sub}</p>}
    </div>
  );
}

// Мінімалістичний бар-чарт (SVG, без бібліотек)
function RevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  if (!data.length) return <EmptyHint icon="calendar" text="Немає даних за цей період" />;

  const max = Math.max(...data.map(d => d.revenue), 1);
  const BAR_W = 8;
  const GAP = 3;
  const H = 60;
  const totalW = data.length * (BAR_W + GAP);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={Math.max(totalW, 280)} height={H + 16} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const barH = Math.max(2, (d.revenue / max) * H);
          const x = i * (BAR_W + GAP);
          return (
            <rect
              key={d.date}
              x={x} y={H - barH} width={BAR_W} height={barH}
              rx={3}
              fill="var(--tg-theme-button-color)"
              opacity={0.85}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
        <span>{fmtDay(data[0]?.date)}</span>
        <span>{fmtDay(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExpenses, setShowExpenses] = useState(false);
  const { master } = useMaster();
  const masterId = master?.id ?? '';

  function reloadDashboard() {
    if (!masterId) return;
    analyticsApi.getDashboard(masterId)
      .then(setStats)
      .catch(() => setStats(getMockStats()));
  }

  useEffect(() => {
    analyticsApi.getDashboard(masterId)
      .then(setStats)
      .catch(() => setStats(getMockStats()))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center h-full py-20">
      <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const s = stats!;

  return (
    <div className="flex flex-col pb-4">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">Аналітика</h1>
        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>Поточний місяць</p>
      </div>

      {/* Головні метрики */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Дохід"
          value={`${s.revenueThisMonth.toLocaleString()} ₴`}
          growth={s.revenueGrowth}
        />
        <StatCard
          label="Записи"
          value={String(s.appointmentsThisMonth)}
          growth={s.appointmentsGrowth}
        />
        <StatCard
          label="Нові клієнти"
          value={String(s.newClientsThisMonth)}
          sub="цього місяця"
        />
        <StatCard
          label="Виконано"
          value={`${s.completionRate}%`}
          sub="від підтверджених"
        />
      </div>

      {/* Витрати + Чистий дохід */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setShowExpenses(true)}
          className="rounded-2xl p-4 text-left transition-transform active:scale-95"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Витрати</p>
            <ChevronRight size={14} style={{ color: 'var(--tg-theme-hint-color)' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: '#e05c5c' }}>
            {fmtMoney(s.expensesThisMonth)}
          </p>
          <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--tg-theme-button-color)' }}>
            Керувати →
          </p>
        </button>
        <div className="rounded-2xl p-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>Чистий дохід</p>
          <p className="text-2xl font-bold" style={{ color: s.netIncomeThisMonth >= 0 ? '#3a9d5d' : '#e05c5c' }}>
            {fmtMoney(s.netIncomeThisMonth)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
            дохід − витрати
          </p>
        </div>
      </div>

      {/* Графік доходу */}
      <div className="mx-4 rounded-2xl p-4 mb-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
        <p className="text-sm font-medium mb-3">Дохід за 30 днів</p>
        <RevenueChart data={s.revenueByDay} />
      </div>

      {/* Топ послуги */}
      <div className="mx-4 rounded-2xl p-4 mb-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
        <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Award size={15} style={{ color: 'var(--tg-theme-button-color)' }} /> Топ-послуги
        </p>
        {s.topServices.length === 0 ? (
          <EmptyHint icon="services" text="Немає завершених записів" />
        ) : (
          <div className="space-y-3">
            {s.topServices.map((svc, i) => {
              const maxCount = s.topServices[0].count;
              const pct = Math.round((svc.count / maxCount) * 100);
              return (
                <div key={svc.name}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium truncate flex-1 mr-2">
                      {i + 1}. {svc.name}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-bold" style={{ color: 'var(--tg-theme-button-color)' }}>
                        {svc.revenue.toLocaleString()} ₴
                      </span>
                      <span className="text-xs ml-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                        ×{svc.count}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tg-theme-bg-color)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: 'var(--tg-theme-button-color)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Клієнти по тегах */}
      <div className="mx-4 rounded-2xl p-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
        <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Users size={15} style={{ color: 'var(--tg-theme-button-color)' }} /> Клієнти по категоріях
        </p>
        {s.clientsByTag.length === 0 ? (
          <EmptyHint icon="clients" text="Клієнтів ще немає" />
        ) : (
          <div className="space-y-2">
            {s.clientsByTag.map((ct) => (
              <div key={ct.tag} className="flex justify-between items-center">
                <span className="text-sm">{TAG_LABELS[ct.tag] ?? ct.tag}</span>
                <span className="text-sm font-bold">{ct.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showExpenses && (
        <ExpenseSheet
          onClose={() => setShowExpenses(false)}
          onChanged={reloadDashboard}
        />
      )}
    </div>
  );
}

// ─── Журнал витрат ──────────────────────────────────────────────────────────
function ExpenseSheet({ onClose, onChanged }: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { hideNav, showNav } = useUI();
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(() => format(kyivNow(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CLOSE_MS = 280;

  useEffect(() => {
    hideNav();
    load();
    return () => showNav();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { from, to } = monthRange();
      setItems(await expensesApi.list(from, to));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  async function addExpense() {
    const value = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      (window.Telegram?.WebApp as any)?.showAlert?.('Вкажіть коректну суму');
      return;
    }
    setSaving(true);
    try {
      // spentAt — обраний день о 12:00 (щоб не було зсуву у крайні дні місяця).
      const spentAt = kyivIso(new Date(`${date}T12:00:00`));
      await expensesApi.create({ amount: value, description: desc.trim() || undefined, spentAt });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setAmount('');
      setDesc('');
      await load();
      onChanged();
    } catch {
      (window.Telegram?.WebApp as any)?.showAlert?.('Не вдалось додати витрату');
    } finally {
      setSaving(false);
    }
  }

  function removeExpense(id: string) {
    const doDelete = () => {
      expensesApi.delete(id)
        .then(async () => {
          window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
          setItems(prev => prev.filter(e => e.id !== id));
          onChanged();
        })
        .catch(() => (window.Telegram?.WebApp as any)?.showAlert?.('Не вдалось видалити'));
    };
    const tg: any = window.Telegram?.WebApp;
    if (tg?.showConfirm) tg.showConfirm('Видалити цю витрату?', (ok: boolean) => { if (ok) doDelete(); });
    else doDelete();
  }

  const total = items.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/40`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col`}
        style={{ background: 'var(--tg-theme-bg-color)', boxShadow: '0 -8px 32px var(--theme-glow-color)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="pt-3 pb-2 flex justify-center flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--tg-theme-secondary-bg-color)' }} />
        </div>

        <div ref={scrollRef} className="overflow-y-auto flex-1 px-5 pb-2 min-h-0">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} style={{ color: 'var(--tg-theme-button-color)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>Витрати за місяць</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Разом: <span className="font-bold" style={{ color: '#e05c5c' }}>{fmtMoney(total)}</span>
          </p>

          {/* Форма додавання */}
          <div className="rounded-2xl p-4 mb-4 space-y-2" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Сума, ₴"
                inputMode="decimal"
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-text-color)', border: '1.5px solid var(--tg-theme-button-color)44' }}
              />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-3 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-text-color)', border: '1.5px solid var(--tg-theme-button-color)44' }}
              />
            </div>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Опис (напр. гель-лаки, фрези)"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-text-color)', border: '1.5px solid var(--tg-theme-button-color)44' }}
            />
            <button
              onClick={addExpense}
              disabled={saving}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50"
              style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
              <Plus size={16} /> {saving ? 'Додаємо...' : 'Додати витрату'}
            </button>
          </div>

          {/* Список */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--tg-theme-button-color)', borderTopColor: 'transparent' }} />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Витрат за цей місяць ще немає
            </p>
          ) : (
            <div className="space-y-2">
              {items.map(e => (
                <div key={e.id} className="flex items-center gap-3 p-3.5 rounded-2xl"
                  style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>
                      {fmtMoney(Number(e.amount))}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      {fmtExpenseDate(e.spentAt)}{e.description ? ` · ${e.description}` : ''}
                    </p>
                  </div>
                  <button onClick={() => removeExpense(e.id)} className="p-2 rounded-xl" style={{ color: '#c04040' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleClose}
            className="w-full py-4 mt-3 rounded-2xl text-sm font-medium"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
            Закрити
          </button>
        </div>

        <div style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', flexShrink: 0 }} />
      </div>
    </div>
  );
}

// Демо-дані для розробки без API
function getMockStats(): DashboardStats {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 29 + i);
    return {
      date: d.toISOString().slice(0, 10),
      revenue: Math.floor(Math.random() * 1500) + 200,
      count: Math.floor(Math.random() * 4) + 1,
    };
  });
  return {
    revenueThisMonth: 18450,
    expensesThisMonth: 3200,
    netIncomeThisMonth: 15250,
    appointmentsThisMonth: 42,
    newClientsThisMonth: 8,
    completionRate: 91,
    revenueGrowth: 12,
    appointmentsGrowth: -3,
    topServices: [
      { name: 'Гель-лак', count: 18, revenue: 11700 },
      { name: 'Манікюр класичний', count: 14, revenue: 6300 },
      { name: 'Манікюр + гель', count: 7, revenue: 6300 },
      { name: 'Педикюр', count: 3, revenue: 1800 },
    ],
    revenueByDay: days,
    clientsByTag: [
      { tag: 'regular', count: 24 },
      { tag: 'new', count: 8 },
      { tag: 'trusted', count: 11 },
      { tag: 'blocked', count: 2 },
    ],
  };
}
