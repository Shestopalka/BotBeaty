import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Calendar, Clock, Users, Scissors, BarChart2, Settings, ChevronRight, Check, Copy } from 'lucide-react';
import { useMaster } from '../../context/MasterContext';
import { appointmentsApi, analyticsApi, mastersApi, slotsApi } from '../../api/client';
import { addDays } from 'date-fns';

interface Apt {
  id: string;
  status: string;
  service?: { name?: string };
  client?: { fullName?: string };
  slot?: { startAt?: string };
}

interface Svc { isActive?: boolean; price?: number | string }

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
  const [services, setServices] = useState<Svc[]>([]);
  const [slotsCount, setSlotsCount] = useState(0);
  const [botUsername, setBotUsername] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!masterId) return;
    const date = format(new Date(), 'yyyy-MM-dd');
    appointmentsApi.getByMaster(masterId, date).then(setToday).catch(() => setToday([]));
    analyticsApi.getDashboard(masterId)
      .then((d) => setRevenue(d?.revenueThisMonth ?? 0))
      .catch(() => setRevenue(null));
    // Дані для setup-чек-листа
    mastersApi.getById(masterId)
      .then((m) => { setServices(m?.services ?? []); setBotUsername(m?.botUsername ?? ''); })
      .catch(() => {});
    const from = new Date().toISOString();
    const to = addDays(new Date(), 30).toISOString();
    slotsApi.getForMaster(masterId, from, to)
      .then((s) => setSlotsCount(Array.isArray(s) ? s.length : 0))
      .catch(() => setSlotsCount(0));
  }, [masterId]);

  const hasPricedService = services.some((s) => s.isActive !== false && Number(s.price) > 0);
  const hasSlots = slotsCount > 0;
  const setupDone = hasPricedService && hasSlots;
  const doneSteps = (hasPricedService ? 1 : 0) + (hasSlots ? 1 : 0);

  function copyLink() {
    if (!botUsername) return;
    navigator.clipboard?.writeText(`https://t.me/${botUsername}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    }).catch(() => {});
  }

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

      {/* Setup-чек-лист — поки кабінет не готовий */}
      {masterId && !setupDone && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--theme-pill-bg)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
              Завершіть налаштування
            </p>
            <span className="text-xs font-semibold" style={{ color: 'var(--tg-theme-link-color)' }}>
              {doneSteps}/2
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <SetupRow done={hasPricedService} to="/master/services" label="Додайте послугу з ціною" />
            <SetupRow done={hasSlots} to="/master/slots" label="Створіть вільні слоти" />
          </div>
          {botUsername && (
            <button onClick={copyLink}
              className="w-full mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: 'var(--tg-theme-bg-color)' }}>
              <Copy size={15} style={{ color: 'var(--tg-theme-button-color)' }} />
              <span className="text-xs flex-1 text-left truncate" style={{ color: 'var(--tg-theme-text-color)' }}>
                t.me/{botUsername}
              </span>
              <span className="text-xs font-medium" style={{ color: 'var(--tg-theme-button-color)' }}>
                {copied ? 'Скопійовано' : 'Копіювати'}
              </span>
            </button>
          )}
        </div>
      )}

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

function SetupRow({ done, to, label }: { done: boolean; to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 py-1.5">
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={done
          ? { background: 'var(--tg-theme-button-color)' }
          : { border: '1.5px solid var(--tg-theme-hint-color)' }}>
        {done && <Check size={12} color="#fff" strokeWidth={3} />}
      </span>
      <span className="text-sm flex-1" style={{
        color: done ? 'var(--tg-theme-hint-color)' : 'var(--tg-theme-text-color)',
        textDecoration: done ? 'line-through' : 'none',
      }}>{label}</span>
      {!done && <ChevronRight size={16} style={{ color: 'var(--tg-theme-link-color)' }} />}
    </Link>
  );
}
