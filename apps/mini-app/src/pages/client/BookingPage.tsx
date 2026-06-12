import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { mastersApi, slotsApi, appointmentsApi } from '../../api/client';
import { useTelegram } from '../../hooks/useTelegram';
import { applyTheme, THEMES, ThemeName } from '../../themes';
import { Illustration } from '../../components/Illustration';
import { MapPin, Scissors, Clock, Check } from 'lucide-react';

type Step = 'intro' | 'service' | 'slot' | 'confirm' | 'success' | 'cancelled';

interface Service { id: string; name: string; durationMinutes: number; price: number; currency: string; }
interface Slot { id: string; startAt: string; endAt: string; }
interface Master {
  id: string; fullName: string; specialties: string[]; services: Service[];
  theme?: string; city?: string; bio?: string; avatarUrl?: string;
}

const SPECIALTY_LABELS: Record<string, string> = {
  manicure: 'Манікюр', pedicure: 'Педикюр', eyelashes: 'Вії', makeup: 'Макіяж',
  hairdresser: 'Перукар', tattoo: 'Тату', eyebrows: 'Брови', massage: 'Масаж',
  cosmetology: 'Косметологія', other: 'Інше',
};

export default function BookingPage() {
  const { masterId } = useParams<{ masterId: string }>();
  const { user } = useTelegram();
  const [step, setStep] = useState<Step>('intro');
  const [master, setMaster] = useState<Master | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    if (!masterId) {
      console.error('[BookingPage] masterId is undefined');
      setMasterLoading(false);
      return;
    }
    console.log('[BookingPage] loading master:', masterId);
    setMasterLoading(true);
    mastersApi.getById(masterId)
      .then((data) => {
        console.log('[BookingPage] master loaded:', data?.fullName, 'theme:', data?.theme);
        setMaster(data);
        // Застосовуємо тему майстра для клієнта
        if (data?.theme && data.theme in THEMES) {
          applyTheme(data.theme as ThemeName);
        }
      })
      .catch((err) => {
        console.error('[BookingPage] failed to load master:', err?.response?.status, err?.message);
      })
      .finally(() => setMasterLoading(false));
  }, [masterId]);

  useEffect(() => {
    if (step === 'slot') loadSlots();
  }, [step, selectedDate]);

  async function loadSlots() {
    setLoading(true);
    const from = selectedDate.toISOString();
    const to = addDays(selectedDate, 1).toISOString();
    try {
      const data = await slotsApi.getAvailable(masterId!, from, to);
      setSlots(data.filter((s: Slot) => isSameDay(new Date(s.startAt), selectedDate)));
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    if (!selectedSlot || !selectedService) return;
    // user може бути null у dev режимі — використовуємо fallback
    const clientTelegramId = String(user?.id ?? 0);
    const clientName = user
      ? `${user.first_name} ${user.last_name ?? ''}`.trim()
      : 'Test Client';
    setBooking(true);
    try {
      const created = await appointmentsApi.create({
        masterId,
        clientTelegramId,
        clientName,
        serviceId: selectedService.id,
        slotId: selectedSlot.id,
      });
      setAppointmentId(created?.id ?? null);
      tg?.HapticFeedback?.notificationOccurred('success');
      setStep('success');
    } catch {
      tg?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setBooking(false);
    }
  }

  async function cancelBooking() {
    if (!appointmentId || !masterId) return;
    setCancelling(true);
    try {
      await appointmentsApi.updateStatus(appointmentId, masterId, 'cancelled_client');
      tg?.HapticFeedback?.notificationOccurred('success');
      setStep('cancelled');
    } catch {
      tg?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setCancelling(false);
    }
  }

  const weekDays = Array.from({ length: 30 }, (_, i) => addDays(startOfDay(new Date()), i));

  if (masterLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'var(--tg-theme-bg-color)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--tg-theme-button-color)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!master) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-3 text-center"
        style={{ background: 'var(--tg-theme-bg-color)' }}>
        <span style={{ color: 'var(--tg-theme-hint-color)', opacity: 0.6 }}>
          <Illustration name="sparkle" size={72} />
        </span>
        <p className="font-bold text-lg" style={{ color: 'var(--tg-theme-text-color)' }}>
          Майстра не знайдено
        </p>
        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
          Посилання недійсне або майстер видалив акаунт
        </p>
      </div>
    );
  }

  // ─── Вітальний екран клієнта (профіль майстра + як це працює) ──────────────
  if (step === 'intro') {
    const specs = (master.specialties ?? []).map(s => SPECIALTY_LABELS[s] ?? s);
    return (
      <div className="flex flex-col min-h-screen px-5 pt-12 pb-8 bb-page"
        style={{ background: 'var(--tg-theme-bg-color)' }}>
        {/* Профіль майстра */}
        <div className="flex flex-col items-center text-center mb-8">
          {master.avatarUrl ? (
            <img src={master.avatarUrl} alt="" className="w-24 h-24 rounded-full object-cover mb-4" />
          ) : (
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold mb-4"
              style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
              {(master.fullName?.[0] ?? '✦').toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
            {master.fullName}
          </h1>
          {specs.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
              {specs.map(s => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-link-color)' }}>{s}</span>
              ))}
            </div>
          )}
          {master.city && (
            <p className="text-sm mt-2.5 flex items-center gap-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
              <MapPin size={13} /> {master.city}
            </p>
          )}
          {master.bio && (
            <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {master.bio}
            </p>
          )}
        </div>

        {/* Як це працює */}
        <div className="rounded-2xl p-4 space-y-3.5" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>Як це працює</p>
          {[
            { Icon: Scissors, t: 'Оберіть послугу' },
            { Icon: Clock, t: 'Виберіть зручний час' },
            { Icon: Check, t: 'Підтвердьте запис' },
          ].map(({ Icon, t }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--theme-pill-bg)' }}>
                <Icon size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{t}</span>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => { tg?.HapticFeedback?.impactOccurred?.('light'); setStep('service'); }}
          className="w-full mt-8 py-4 rounded-2xl font-semibold text-base"
          style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
          Записатись онлайн
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-4">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">{master.fullName}</h1>
        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
          {(master.specialties ?? []).map(s => SPECIALTY_LABELS[s] ?? s).join(', ')}
        </p>
      </div>

      {/* Step: вибір послуги */}
      {step === 'service' && (
        <div className="px-4 space-y-3">
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Оберіть послугу
          </p>
          {(master?.services ?? []).filter(s => (s as any).isActive !== false).length === 0 && (
            <div className="flex flex-col items-center py-16 gap-2">
              <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                Майстер ще не додав послуги
              </p>
            </div>
          )}
          {(master?.services ?? []).filter(s => (s as any).isActive !== false).map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedService(s); setStep('slot'); }}
              className="w-full text-left p-4 rounded-2xl flex justify-between items-center"
              style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
            >
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  {s.durationMinutes} хвилин
                </p>
              </div>
              <span className="font-bold" style={{ color: 'var(--tg-theme-button-color)' }}>
                {s.price} {s.currency || 'UAH'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Step: вибір дати та часу */}
      {step === 'slot' && (
        <div className="flex flex-col">
          <button
            onClick={() => setStep('service')}
            className="mx-4 mb-3 text-sm text-left"
            style={{ color: 'var(--tg-theme-button-color)' }}
          >
            ← {selectedService?.name}
          </button>

          {/* Дати */}
          <div className="flex gap-2 px-4 overflow-x-auto pb-2">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, selectedDate);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className="flex flex-col items-center min-w-[52px] py-2 px-1 rounded-xl transition-all"
                  style={isSelected
                    ? { background: 'var(--tg-theme-button-color)', color: '#fff' }
                    : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }
                  }
                >
                  <span className="text-xs opacity-70">{format(day, 'EEE', { locale: uk })}</span>
                  <span className="text-lg font-bold">{format(day, 'd')}</span>
                </button>
              );
            })}
          </div>

          {/* Слоти */}
          <div className="px-4 mt-3">
            <p className="text-sm mb-2" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {format(selectedDate, 'd MMMM', { locale: uk })}
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                Немає вільних слотів на цей день
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => { setSelectedSlot(slot); setStep('confirm'); }}
                    className="py-3 rounded-xl text-sm font-medium text-center"
                    style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
                  >
                    {format(new Date(slot.startAt), 'HH:mm')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step: підтвердження */}
      {step === 'confirm' && selectedService && selectedSlot && (
        <div className="px-4 space-y-4">
          <button onClick={() => setStep('slot')} className="text-sm" style={{ color: 'var(--tg-theme-button-color)' }}>
            ← Назад
          </button>
          <h2 className="text-lg font-bold">Підтвердження запису</h2>

          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <Row label="Послуга" value={selectedService.name} />
            <Row label="Дата" value={format(new Date(selectedSlot.startAt), 'd MMMM yyyy', { locale: uk })} />
            <Row label="Час" value={format(new Date(selectedSlot.startAt), 'HH:mm')} />
            <Row label="Тривалість" value={`${selectedService.durationMinutes} хв`} />
            <div className="border-t pt-3" style={{ borderColor: 'var(--tg-theme-hint-color)' }}>
              <Row label="До сплати" value={`${selectedService.price} ${selectedService.currency || 'UAH'}`} bold />
            </div>
          </div>

          <button
            onClick={confirmBooking}
            disabled={booking}
            className="w-full py-4 rounded-2xl text-white font-bold text-base disabled:opacity-50"
            style={{ background: 'var(--tg-theme-button-color)' }}
          >
            {booking ? 'Бронюємо...' : 'Підтвердити запис'}
          </button>
        </div>
      )}

      {/* Step: успіх */}
      {step === 'success' && selectedService && selectedSlot && (
        <div className="flex flex-col items-center px-4 py-12 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
            <Illustration name="sparkle" size={38} />
          </div>
          <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--tg-theme-text-color)' }}>
            Запис підтверджено!
          </h2>
          <p className="text-center text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Майстер отримав сповіщення і підтвердить запис найближчим часом.
          </p>

          {/* Деталі запису */}
          <div className="w-full rounded-2xl p-4 space-y-2.5 mt-2"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', boxShadow: 'var(--theme-shadow)' }}>
            <Row label="Послуга" value={selectedService.name} />
            <Row label="Дата" value={format(new Date(selectedSlot.startAt), 'd MMMM yyyy', { locale: uk })} />
            <Row label="Час" value={format(new Date(selectedSlot.startAt), 'HH:mm')} />
            <div className="border-t pt-2.5" style={{ borderColor: 'var(--tg-theme-hint-color)22' }}>
              <Row label="Сума" value={`${selectedService.price} ${selectedService.currency || 'UAH'}`} bold />
            </div>
          </div>

          <button
            onClick={() => tg?.close()}
            className="w-full py-4 rounded-2xl font-semibold text-base mt-2"
            style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }}>
            Закрити
          </button>

          {appointmentId && (
            <button
              onClick={cancelBooking}
              disabled={cancelling}
              className="w-full py-3 rounded-2xl text-sm font-medium disabled:opacity-50"
              style={{ color: '#c04040', background: 'rgba(224,92,92,0.1)' }}>
              {cancelling ? 'Скасовуємо...' : 'Скасувати запис'}
            </button>
          )}
        </div>
      )}

      {/* Step: скасовано */}
      {step === 'cancelled' && (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-16 gap-4">
          <div className="text-5xl">✓</div>
          <h2 className="text-xl font-bold text-center" style={{ color: 'var(--tg-theme-text-color)' }}>
            Запис скасовано
          </h2>
          <p className="text-center text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Майстер отримає сповіщення про скасування.
          </p>
          <button
            onClick={() => setStep('service')}
            className="mt-2 px-8 py-3 rounded-2xl font-semibold"
            style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }}>
            Записатись знову
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-base' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
