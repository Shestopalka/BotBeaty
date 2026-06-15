import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { mastersApi, slotsApi, appointmentsApi } from '../../api/client';
import { useTelegram } from '../../hooks/useTelegram';
import { applyTheme, THEMES, ThemeName } from '../../themes';
import { Illustration } from '../../components/Illustration';
import { Avatar } from '../../components/Avatar';
import { MapPin, Scissors, Clock, Check } from 'lucide-react';
import { formatPrice, formatPriceShort, PriceType } from '../../lib/price';

type Step = 'intro' | 'service' | 'slot' | 'confirm' | 'success' | 'cancelled';

interface Service {
  id: string; name: string; durationMinutes: number;
  priceType?: PriceType; price: number; priceMax?: number | null; currency: string;
}
interface Slot { id: string; startAt: string; endAt: string; }
interface Master {
  id: string; fullName: string; specialties: string[]; services: Service[];
  theme?: string; city?: string; bio?: string; avatarUrl?: string;
  cancellationHours?: number;
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
  const [phone, setPhone] = useState('');
  const [nextSlot, setNextSlot] = useState<string | null | undefined>(undefined);

  // Валідний український номер: 10–13 цифр (можна з +).
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 13;

  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    if (!masterId) {
      setMasterLoading(false);
      return;
    }
    setMasterLoading(true);
    mastersApi.getById(masterId)
      .then((data) => {
        setMaster(data);
        // Застосовуємо тему майстра для клієнта
        if (data?.theme && data.theme in THEMES) {
          applyTheme(data.theme as ThemeName);
        }
      })
      .catch(() => { /* показуємо екран «майстра не знайдено» нижче */ })
      .finally(() => setMasterLoading(false));
  }, [masterId]);

  useEffect(() => {
    if (step === 'slot') loadSlots();
  }, [step, selectedDate]);

  // Найближчий вільний слот — для вітального екрана.
  useEffect(() => {
    if (!masterId) return;
    slotsApi.getNextAvailable(masterId)
      .then((s) => setNextSlot(s?.startAt ?? null))
      .catch(() => setNextSlot(null));
  }, [masterId]);

  // Telegram тримає webview «живим»: при повторному відкритті стейт (зокрема
  // вибрана дата) лишається з минулого сеансу. Якщо обрана дата вже в минулому —
  // повертаємо на сьогодні. Перевіряємо на маунті та коли застосунок знову видно.
  useEffect(() => {
    function syncToday() {
      const today = startOfDay(new Date());
      setSelectedDate((prev) => (prev.getTime() < today.getTime() ? today : prev));
    }
    syncToday();
    document.addEventListener('visibilitychange', syncToday);
    return () => document.removeEventListener('visibilitychange', syncToday);
  }, []);

  async function loadSlots() {
    setLoading(true);
    const from = selectedDate.toISOString();
    const to = addDays(selectedDate, 1).toISOString();
    try {
      const data = await slotsApi.getAvailable(masterId!, from, to);
      const now = Date.now();
      // Показуємо лише слоти обраного дня, час яких ще не минув.
      setSlots(
        data.filter(
          (s: Slot) =>
            isSameDay(new Date(s.startAt), selectedDate) &&
            new Date(s.startAt).getTime() > now,
        ),
      );
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  // Показати зрозуміле повідомлення про помилку (бек повертає текст у message).
  function showError(e: any, fallback: string) {
    const msg = e?.response?.data?.message ?? fallback;
    const text = Array.isArray(msg) ? msg.join(', ') : msg;
    const a: any = window.Telegram?.WebApp;
    if (a?.showAlert) a.showAlert(text);
    else alert(text);
  }

  async function confirmBooking() {
    if (!selectedSlot || !selectedService) return;
    // Без initData бекенд не зможе підтвердити особу клієнта. Це буває, коли
    // сторінку відкрито не через кнопку в боті. Підкажемо, як відкрити правильно.
    if (!window.Telegram?.WebApp?.initData) {
      const w: any = window.Telegram?.WebApp;
      const diag = w
        ? `platform=${w.platform}, v=${w.version}, unsafeUser=${!!w.initDataUnsafe?.user}`
        : 'Telegram WebApp недоступний';
      showError(null, `Щоб записатись, відкрийте бота й натисніть «Записатись онлайн» (нове повідомлення /start), або кнопку-меню біля поля вводу.\n\n[debug: ${diag}]`);
      return;
    }
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
        clientPhone: phone.trim(),
      });
      setAppointmentId(created?.id ?? null);
      tg?.HapticFeedback?.notificationOccurred('success');
      setStep('success');
    } catch (e) {
      tg?.HapticFeedback?.notificationOccurred('error');
      showError(e, 'Не вдалось створити запис. Спробуйте ще раз.');
      // Слот міг щойно стати зайнятим — оновлюємо список і повертаємо до вибору часу.
      setStep('slot');
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
    } catch (e) {
      tg?.HapticFeedback?.notificationOccurred('error');
      showError(e, 'Не вдалось скасувати запис.');
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

  // ─── Вітальний екран клієнта (профіль + послуги + як це працює) ────────────
  if (step === 'intro') {
    const specs = (master.specialties ?? []).map(s => SPECIALTY_LABELS[s] ?? s);
    const activeServices = (master.services ?? []).filter(s => (s as any).isActive !== false);
    const previewServices = activeServices.slice(0, 4);

    // Підпис «найближче вільне»: undefined=завантаження, null=немає, string=є.
    let nextLabel = '—';
    if (nextSlot === undefined) nextLabel = '…';
    else if (nextSlot) {
      const d = new Date(nextSlot);
      nextLabel = isSameDay(d, new Date())
        ? `сьогодні ${format(d, 'HH:mm')}`
        : format(d, 'd MMM', { locale: uk });
    } else nextLabel = 'запит';

    const ch = master.cancellationHours ?? 0;

    return (
      <div className="flex flex-col min-h-screen px-5 pt-12 pb-8 bb-page"
        style={{ background: 'var(--tg-theme-bg-color)' }}>
        {/* Профіль майстра */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="mb-4">
            <Avatar name={master.fullName} masterId={master.id} avatarUrl={master.avatarUrl} size={96} />
          </div>
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

        {/* Стат-рядок */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 rounded-2xl py-2.5 text-center" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <p className="font-bold text-base" style={{ color: 'var(--tg-theme-text-color)' }}>{activeServices.length}</p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>послуг</p>
          </div>
          <div className="flex-1 rounded-2xl py-2.5 text-center" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <p className="font-bold text-base" style={{ color: 'var(--tg-theme-text-color)' }}>{nextLabel}</p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>найближче</p>
          </div>
          {ch > 0 && (
            <div className="flex-1 rounded-2xl py-2.5 text-center" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
              <p className="font-bold text-base" style={{ color: 'var(--tg-theme-text-color)' }}>{ch} год</p>
              <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>скасування</p>
            </div>
          )}
        </div>

        {/* Прев'ю послуг */}
        {previewServices.length > 0 && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>Послуги</p>
              <button onClick={() => { tg?.HapticFeedback?.impactOccurred?.('light'); setStep('service'); }}
                className="text-xs font-medium" style={{ color: 'var(--tg-theme-button-color)' }}>
                {activeServices.length > previewServices.length ? `усі ${activeServices.length} →` : 'усі →'}
              </button>
            </div>
            {previewServices.map((s, i) => (
              <div key={s.id}
                className="flex items-center justify-between py-2"
                style={i < previewServices.length - 1 ? { borderBottom: '0.5px solid var(--theme-glow-color, rgba(0,0,0,0.06))' } : undefined}>
                <span className="text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{s.name}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--tg-theme-button-color)' }}>{formatPriceShort(s)}</span>
              </div>
            ))}
          </div>
        )}

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

        <div className="flex-1 min-h-[16px]" />

        <button
          onClick={() => { tg?.HapticFeedback?.impactOccurred?.('light'); setStep('service'); }}
          className="w-full mt-6 py-4 rounded-2xl font-semibold text-base"
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
                {formatPrice(s)}
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
              <Row label="Вартість" value={formatPrice(selectedService)} bold />
            </div>
          </div>

          {/* Номер телефону — щоб майстер міг зателефонувати, якщо не вийде в Telegram */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--tg-theme-text-color)' }}>
              Ваш номер телефону
            </label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380 67 123 45 67"
              className="w-full px-4 py-3 rounded-2xl text-base outline-none"
              style={{
                background: 'var(--tg-theme-bg-color)',
                color: 'var(--tg-theme-text-color)',
                border: '1.5px solid var(--theme-glow-color, var(--tg-theme-hint-color))',
              }}
            />
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Майстер зателефонує, якщо не вдасться звʼязатися в Telegram.
            </p>
          </div>

          <button
            onClick={confirmBooking}
            disabled={booking || !phoneValid}
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
              <Row label="Вартість" value={formatPrice(selectedService)} bold />
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
