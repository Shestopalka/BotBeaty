import { useState, useEffect } from 'react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Check, X, Clock, Calendar, UserX, Phone, Copy } from 'lucide-react';
import { appointmentsApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { Illustration } from '../../components/Illustration';
import { formatPrice, PriceType } from '../../lib/price';

interface Appointment {
  id: string;
  status: string;
  pricePaid: number;
  currency: string;
  client: { fullName: string; tag: string; phone?: string | null } | null;
  service: { name: string; durationMinutes: number; priceType?: PriceType; price?: number; priceMax?: number | null } | null;
  slot: { startAt: string; endAt: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:          { label: 'Очікує',       bg: 'rgba(239,159,39,0.12)',  color: '#c07010' },
  confirmed:        { label: 'Підтверджено', bg: 'rgba(29,158,117,0.12)',  color: '#0f6e56' },
  completed:        { label: 'Завершено',    bg: 'var(--theme-pill-bg)',    color: 'var(--tg-theme-hint-color)' },
  cancelled_client: { label: 'Скасовано',    bg: 'rgba(224,92,92,0.12)',   color: '#c04040' },
  cancelled_master: { label: 'Скасовано',    bg: 'rgba(224,92,92,0.12)',   color: '#c04040' },
  no_show:          { label: 'Не прийшов',  bg: 'rgba(239,159,39,0.12)',   color: '#c07010' },
};

const TAG_ICONS: Record<string, string> = {
  new: '✦', regular: '★', trusted: '◆', blocked: '✕', unwanted: '△',
};

export default function SchedulePage() {
  const { master } = useMaster();
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const masterId = master?.id ?? '';
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 380);

  useEffect(() => { if (masterId) loadAppointments(); }, [selectedDate, masterId]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function loadAppointments() {
    setLoading(true);
    try {
      const data = await appointmentsApi.getByMaster(masterId, format(selectedDate, 'yyyy-MM-dd'));
      setAppointments(data);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await appointmentsApi.updateStatus(id, masterId, status);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      loadAppointments();
    } catch { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'); }
  }

  // Адаптивна к-сть дат: 7 на телефоні, більше — на ширшому екрані.
  const dayCount = Math.min(30, Math.max(7, Math.floor((vw - 48) / 54)));
  const weekDays = Array.from({ length: dayCount }, (_, i) => addDays(startOfDay(new Date()), i));
  const todayAppointments = appointments.filter(apt =>
    isSameDay(new Date(apt.slot?.startAt ?? Date.now()), selectedDate)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>Розклад</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
          {format(selectedDate, 'd MMMM yyyy', { locale: uk })}
        </p>
      </div>

      {/* Тижневий календар */}
      <div className="flex gap-2 px-5 py-3 overflow-x-auto">
        {weekDays.map((day) => {
          const isSel = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          return (
            <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
              className="flex flex-col items-center min-w-[48px] py-2.5 px-1 rounded-2xl transition-all"
              style={isSel ? {
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                boxShadow: 'var(--theme-btn-shadow)',
              } : {
                background: 'var(--tg-theme-secondary-bg-color)',
                color: isToday ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-text-color)',
              }}>
              <span className="text-[10px] font-medium opacity-70">
                {format(day, 'EEE', { locale: uk })}
              </span>
              <span className="text-lg font-bold leading-tight">{format(day, 'd')}</span>
            </button>
          );
        })}
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--tg-theme-button-color)', borderTopColor: 'transparent' }} />
          </div>
        ) : todayAppointments.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span style={{ color: 'var(--tg-theme-button-color)', opacity: 0.8 }}>
              <Illustration name="appointments" size={84} />
            </span>
            <p style={{ color: 'var(--tg-theme-hint-color)' }}>Записів немає</p>
          </div>
        ) : (
          todayAppointments.map(apt => (
            <AppointmentCard key={apt.id} apt={apt}
              onConfirm={() => updateStatus(apt.id, 'confirmed')}
              onCancel={() => updateStatus(apt.id, 'cancelled_master')}
              onComplete={() => updateStatus(apt.id, 'completed')}
              onNoShow={() => updateStatus(apt.id, 'no_show')}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AppointmentCard({ apt, onConfirm, onCancel, onComplete, onNoShow }: {
  apt: Appointment; onConfirm: () => void; onCancel: () => void; onComplete: () => void; onNoShow: () => void;
}) {
  const startTime = format(new Date(apt.slot?.startAt ?? Date.now()), 'HH:mm');
  const endTime = format(new Date(apt.slot?.endAt ?? Date.now()), 'HH:mm');
  const status = STATUS_CONFIG[apt.status] ?? STATUS_CONFIG.pending;
  const phone = apt.client?.phone;
  const [copied, setCopied] = useState(false);

  function copyPhone() {
    if (!phone) return;
    navigator.clipboard?.writeText(phone).then(() => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{
      background: 'var(--tg-theme-secondary-bg-color)',
      boxShadow: 'var(--theme-shadow)',
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--tg-theme-button-color)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
            {startTime} — {endTime}
          </span>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: status.bg, color: status.color }}>
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--tg-theme-button-color)', fontSize: 11 }}>
          {TAG_ICONS[apt.client?.tag ?? ''] ?? '·'}
        </span>
        <span className="font-medium text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
          {apt.client?.fullName ?? 'Клієнт'}
        </span>
      </div>

      {phone && (
        <div className="flex items-center gap-2">
          <a href={`tel:${phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium flex-1"
            style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
            <Phone size={14} />
            {phone}
          </a>
          <button onClick={copyPhone}
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{ background: 'var(--theme-pill-bg)', color: copied ? '#0f6e56' : 'var(--tg-theme-hint-color)' }}
            aria-label="Скопіювати номер">
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
          {apt.service?.name ?? '—'} · {apt.service?.durationMinutes ?? '?'} хв
        </span>
        <span className="font-bold text-sm" style={{ color: 'var(--tg-theme-button-color)' }}>
          {apt.service?.priceType === 'range'
            ? formatPrice({ ...apt.service, price: apt.service.price ?? apt.pricePaid, currency: apt.currency })
            : formatPrice({ price: apt.pricePaid, currency: apt.currency })}
        </span>
      </div>

      {apt.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
              boxShadow: 'var(--theme-btn-shadow)',
            }}>
            <Check size={15} strokeWidth={2.5} /> Підтвердити
          </button>
          <button onClick={onCancel}
            className="w-11 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(224,92,92,0.1)', color: '#c04040' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {apt.status === 'confirmed' && (
        <div className="flex gap-2 pt-1">
          <button onClick={onComplete}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: 'var(--theme-pill-bg)',
              color: 'var(--tg-theme-button-color)',
              border: '1px solid var(--tg-theme-button-color)',
            }}>
            Завершити візит
          </button>
          <button onClick={onNoShow}
            className="w-11 flex items-center justify-center rounded-xl"
            title="Не прийшов"
            style={{ background: 'rgba(239,159,39,0.12)', color: '#c07010' }}>
            <UserX size={16} />
          </button>
          <button onClick={onCancel}
            className="w-11 flex items-center justify-center rounded-xl"
            title="Скасувати запис"
            style={{ background: 'rgba(224,92,92,0.1)', color: '#c04040' }}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
