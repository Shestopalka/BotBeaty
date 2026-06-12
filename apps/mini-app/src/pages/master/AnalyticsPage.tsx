import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Users, Award } from 'lucide-react';
import { analyticsApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
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
  appointmentsThisMonth: number;
  newClientsThisMonth: number;
  completionRate: number;
  revenueGrowth: number;
  appointmentsGrowth: number;
  topServices: { name: string; count: number; revenue: number }[];
  revenueByDay: { date: string; revenue: number; count: number }[];
  clientsByTag: { tag: string; count: number }[];
}

const TAG_LABELS: Record<string, string> = {
  new: 'Нові', regular: 'Постійні', trusted: 'Перевірені',
  blocked: 'Заблоковані', unwanted: 'Небажані',
};

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
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { master } = useMaster();
  const masterId = master?.id ?? '';

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
