import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Calendar, Clock, Users, Scissors, BarChart2, Settings, ChevronRight } from 'lucide-react';
import { useMaster } from '../../context/MasterContext';
import { appointmentsApi, analyticsApi } from '../../api/client';

interface Apt {
  id: string;
  status: string;
  service?: { name?: string };
  client?: { fullName?: string };
  slot?: { startAt?: string };
}

const NAV = [
  { to: '/master/schedule',  icon: Calendar,  label: 'Розклад' },
  { to: '/master/slots',     icon: Clock,     label: 'Слоти' },
  { to: '/master/clients',   icon: Users,     label: 'Клієнти' },
  { to: '/master/services',  icon: Scissors,  label: 'Послуги' },
  { to: '/master/analytics', icon: BarChart2, label: 'Аналітика' },
  { to: '/master/settings',  icon: Settings,  label: 'Налаштування' },
];

const ACTIVE = new Set(['pending', 'confirmed']);

export default function HomePage() {
  const { master } = useMaster();
  const masterId = master?.id ?? '';
  const [today, setToday] = useState<Apt[]>([]);
  const [revenue, setRevenue] = useState<number | null>(null);

  useEffect(() => {
    if (!masterId) return;
    const date = format(new Date(), 'yyyy-MM-dd');
    appointmentsApi.getByMaster(masterId, date).then(setToday).catch(() => setToday([]));
    analyticsApi.getDashboard(masterId)
      .then((d) => setRevenue(d?.revenueThisMonth ?? 0))
      .catch(() => setRevenue(null));
  }, [masterId]);

  const upcoming = today
    .filter((a) => ACTIVE.has(a.status) && a.slot?.startAt)
    .sort((a, b) => (a.slot!.startAt! < b.slot!.startAt! ? -1 : 1));
  const next = upcoming[0];
  const firstName = (master?.fullName ?? '').split(' ')[0] || 'майстре';

  return (
    <div className="px-4 pt-6 pb-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-semibold"
          style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
          {(master?.fullName?.[0] ?? '✦').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-tight" style={{ color: 'var(--tg-theme-text-color)' }}>
            Вітаю, {firstName}
          </p>
          <p className="text-xs capitalize" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {format(new Date(), 'EEEE, d MMMM', { locale: uk })}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Сьогодні</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--tg-theme-text-color)' }}>
            {today.filter((a) => ACTIVE.has(a.status)).length} <span className="text-sm font-medium">записів</span>
          </p>
        </div>
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Дохід / місяць</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--tg-theme-text-color)' }}>
            {revenue === null ? '—' : `${Math.round(revenue).toLocaleString('uk-UA')} ₴`}
          </p>
        </div>
      </div>

      {/* Next appointment */}
      <Link to="/master/schedule" className="flex items-center gap-3 rounded-2xl p-3.5"
        style={{ background: 'var(--theme-pill-bg)' }}>
        <Clock size={20} style={{ color: 'var(--tg-theme-button-color)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: 'var(--tg-theme-link-color)' }}>Найближчий запис</p>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--tg-theme-text-color)' }}>
            {next
              ? `${next.service?.name ?? 'Послуга'} · ${next.client?.fullName ?? 'Клієнт'} · ${format(new Date(next.slot!.startAt!), 'HH:mm')}`
              : 'На сьогодні вільно'}
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--tg-theme-button-color)' }} />
      </Link>

      {/* Nav grid */}
      <p className="text-xs mt-1" style={{ color: 'var(--tg-theme-hint-color)' }}>Кабінет</p>
      <div className="grid grid-cols-2 gap-3">
        {NAV.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to}
            className="rounded-2xl p-4 flex flex-col gap-2.5"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', boxShadow: 'var(--theme-shadow)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--theme-pill-bg)' }}>
              <Icon size={20} style={{ color: 'var(--tg-theme-button-color)' }} strokeWidth={1.9} />
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
