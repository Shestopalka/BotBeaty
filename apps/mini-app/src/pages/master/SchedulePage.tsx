import { useState, useEffect, useRef } from 'react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Check, X, Clock, Calendar, UserX, Phone, Copy, Plus, Trash2 } from 'lucide-react';
import { appointmentsApi, clientsApi, slotsApi, mastersApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { useUI } from '../../context/UIContext';
import { Illustration } from '../../components/Illustration';
import { formatPrice, formatPriceShort, PriceType } from '../../lib/price';
import { showApiError } from '../../lib/notify';

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
  const [showBook, setShowBook] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [removingApt, setRemovingApt] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());

  function deleteApt(id: string) {
    if (removingApt.has(id)) return;
    setRemovingApt(prev => new Set(prev).add(id));
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    appointmentsApi.delete(id)
      .then(() => {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        setTimeout(() => {
          setAppointments(prev => prev.filter(a => a.id !== id));
          setRemovingApt(prev => { const n = new Set(prev); n.delete(id); return n; });
        }, 280);
      })
      .catch((e) => {
        setRemovingApt(prev => { const n = new Set(prev); n.delete(id); return n; });
        showApiError(e, 'Не вдалось видалити запис.');
      });
  }

  // Зміна дати / майстра — завантажуємо без діфу (нічого не анімуємо).
  useEffect(() => {
    if (!masterId) return;
    seenIds.current = new Set();
    setNewIds(new Set());
    loadAppointments(false);
  }, [selectedDate, masterId]);

  // Розумний полінг: тихо оновлюємо розклад, поки сторінка відкрита й активна.
  // Нові записи зʼявляються самі (без перезавантаження) + підсвічуються.
  useEffect(() => {
    if (!masterId) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadAppointments(true);
    }, 12000);
    return () => clearInterval(id);
  }, [masterId, selectedDate]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function loadAppointments(diff: boolean) {
    if (!diff) setLoading(true);
    try {
      const data = await appointmentsApi.getByMaster(masterId, format(selectedDate, 'yyyy-MM-dd'));
      if (diff) {
        // Які записи зʼявились від попереднього разу — їх анімуємо.
        const fresh = data.filter((a: Appointment) => !seenIds.current.has(a.id)).map((a: Appointment) => a.id);
        if (fresh.length) {
          setNewIds(new Set(fresh));
          window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
          setTimeout(() => setNewIds(new Set()), 2500);
        }
      }
      data.forEach((a: Appointment) => seenIds.current.add(a.id));
      setAppointments(data);
    } catch { if (!diff) setAppointments([]); }
    finally { if (!diff) setLoading(false); }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await appointmentsApi.updateStatus(id, masterId, status);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      loadAppointments(false);
    } catch (e) { showApiError(e, 'Не вдалось оновити запис.'); }
  }

  // Адаптивна к-сть дат: 7 на телефоні, більше — на ширшому екрані.
  const dayCount = Math.min(30, Math.max(7, Math.floor((vw - 48) / 54)));
  const weekDays = Array.from({ length: dayCount }, (_, i) => addDays(startOfDay(new Date()), i));
  const todayAppointments = appointments.filter(apt =>
    isSameDay(new Date(apt.slot?.startAt ?? Date.now()), selectedDate)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>Розклад</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {format(selectedDate, 'd MMMM yyyy', { locale: uk })}
          </p>
        </div>
        <button onClick={() => setShowBook(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold shrink-0"
          style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
          <Plus size={15} strokeWidth={2.5} /> Записати
        </button>
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
            <AppointmentCard key={apt.id} apt={apt} isNew={newIds.has(apt.id)}
              isRemoving={removingApt.has(apt.id)}
              onDelete={() => deleteApt(apt.id)}
              onConfirm={() => updateStatus(apt.id, 'confirmed')}
              onCancel={() => updateStatus(apt.id, 'cancelled_master')}
              onComplete={() => updateStatus(apt.id, 'completed')}
              onNoShow={() => updateStatus(apt.id, 'no_show')}
            />
          ))
        )}
      </div>

      {showBook && (
        <BookClientSheet
          masterId={masterId}
          initialDate={selectedDate}
          onClose={() => setShowBook(false)}
          onCreated={(d) => { setShowBook(false); setSelectedDate(startOfDay(d)); loadAppointments(false); }}
        />
      )}
    </div>
  );
}

function AppointmentCard({ apt, isNew, isRemoving, onDelete, onConfirm, onCancel, onComplete, onNoShow }: {
  apt: Appointment; isNew?: boolean; isRemoving?: boolean; onDelete: () => void; onConfirm: () => void; onCancel: () => void; onComplete: () => void; onNoShow: () => void;
}) {
  const terminal = ['cancelled_client', 'cancelled_master', 'no_show', 'completed'].includes(apt.status);
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
    <div className={`rounded-2xl p-4 space-y-3 ${isNew ? 'bb-new-card' : ''} ${isRemoving ? 'bb-shrink-out' : ''}`} style={{
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
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: status.bg, color: status.color }}>
            {status.label}
          </span>
          {terminal && (
            <button onClick={onDelete} disabled={isRemoving} title="Видалити запис"
              className="p-1 rounded-lg disabled:opacity-40" style={{ color: '#c04040' }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
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

interface SvcLite { id: string; name: string; durationMinutes: number; priceType?: PriceType; price: number; priceMax?: number | null; currency: string; isActive?: boolean; }
interface ClientLite { id: string; fullName: string; phone?: string | null; tag: string; }
interface SlotLite { id: string; startAt: string; isBooked?: boolean; }

/** Шторка: майстер записує клієнта сам (існуючого або нового офлайн). */
function BookClientSheet({ masterId, initialDate, onClose, onCreated }: {
  masterId: string; initialDate: Date; onClose: () => void; onCreated: (d: Date) => void;
}) {
  const { hideNav, showNav } = useUI();
  const [closing, setClosing] = useState(false);
  const CLOSE_MS = 280;

  const [services, setServices] = useState<SvcLite[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  // Якщо в розкладі обрано минулий день — для запису стартуємо з сьогодні
  // (минулих днів немає у стрічці вибору).
  const [date, setDate] = useState(() => {
    const today0 = startOfDay(new Date());
    const init0 = startOfDay(initialDate);
    return init0.getTime() < today0.getTime() ? today0 : init0;
  });
  const [slots, setSlots] = useState<SlotLite[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [service, setService] = useState<SvcLite | null>(null);
  const [slot, setSlot] = useState<SlotLite | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hideNav();
    mastersApi.getById(masterId)
      .then((m) => {
        const active = (m?.services ?? []).filter((s: SvcLite) => s.isActive !== false);
        setServices(active);
        // Автовибір: якщо послуга не обрана — беремо першу (зазвичай їх небагато).
        // Прибирає «сіру» кнопку, коли майстер забув тапнути по єдиній послузі.
        setService(prev => prev ?? active[0] ?? null);
      })
      .catch(() => setServices([]));
    clientsApi.getByMaster(masterId).then(setClients).catch(() => setClients([]));
    return () => showNav();
  }, []);

  useEffect(() => {
    setSlotsLoading(true);
    setSlot(null);
    const from = date.toISOString();
    const to = addDays(date, 1).toISOString();
    // getForMaster — усі слоти майстра (як на сторінці «Слоти»). Беремо вільні
    // обраного дня. На відміну від getAvailable, не відкидаємо «минулі» —
    // майстер бачить ті самі слоти, що й у себе в розкладі.
    slotsApi.getForMaster(masterId, from, to)
      .then((data: SlotLite[]) =>
        setSlots(data.filter(s => !s.isBooked && isSameDay(new Date(s.startAt), date))))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [date, masterId]);

  const days = Array.from({ length: 30 }, (_, i) => addDays(startOfDay(new Date()), i));
  const filteredClients = clients.filter(c =>
    c.tag !== 'blocked' && c.fullName.toLowerCase().includes(search.toLowerCase()));

  const canSave = !!service && !!slot &&
    (mode === 'existing' ? !!clientId : newName.trim().length > 0);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  async function submit() {
    if (!canSave || !service || !slot) return;
    setSubmitting(true);
    try {
      await appointmentsApi.createByMaster({
        serviceId: service.id,
        slotId: slot.id,
        ...(mode === 'existing'
          ? { clientId }
          : { clientName: newName.trim(), clientPhone: newPhone.trim() || undefined }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      onCreated(new Date(slot.startAt));
    } catch (e) {
      showApiError(e, 'Не вдалось створити запис.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' };

  return (
    <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/40`} />
      <div className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col`}
        style={{ background: 'var(--tg-theme-bg-color)', boxShadow: '0 -8px 32px var(--theme-glow-color)', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="pt-3 pb-1 flex justify-center flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--tg-theme-secondary-bg-color)' }} />
        </div>
        <div className="px-5 pb-2 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>Записати клієнта</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-2 min-h-0 space-y-4">
          {/* Послуга */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--tg-theme-hint-color)' }}>Послуга</p>
            <div className="space-y-2">
              {services.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>Спершу додайте послуги.</p>
              )}
              {services.map(s => (
                <button key={s.id} onClick={() => setService(s)}
                  className="w-full flex items-center justify-between p-3 rounded-xl text-left"
                  style={{ background: 'var(--tg-theme-secondary-bg-color)',
                    border: service?.id === s.id ? '1.5px solid var(--tg-theme-button-color)' : '1.5px solid transparent' }}>
                  <span className="text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{s.name} · {s.durationMinutes} хв</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--tg-theme-button-color)' }}>{formatPriceShort(s)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Дата + час */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--tg-theme-hint-color)' }}>Дата та час</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map(d => {
                const sel = isSameDay(d, date);
                return (
                  <button key={d.toISOString()} onClick={() => setDate(d)}
                    className="flex flex-col items-center min-w-[46px] py-2 px-1 rounded-xl"
                    style={sel
                      ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }
                      : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
                    <span className="text-[10px] opacity-70">{format(d, 'EEE', { locale: uk })}</span>
                    <span className="text-base font-bold">{format(d, 'd')}</span>
                  </button>
                );
              })}
            </div>
            {slotsLoading ? (
              <p className="text-sm py-2" style={{ color: 'var(--tg-theme-hint-color)' }}>Завантаження…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm py-2" style={{ color: 'var(--tg-theme-hint-color)' }}>Немає вільних слотів на цей день.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map(s => (
                  <button key={s.id} onClick={() => setSlot(s)}
                    className="py-2.5 rounded-xl text-sm font-medium"
                    style={slot?.id === s.id
                      ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }
                      : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
                    {format(new Date(s.startAt), 'HH:mm')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Клієнт */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--tg-theme-hint-color)' }}>Клієнт</p>
            <div className="flex gap-2 mb-2">
              {([['existing', 'Існуючий'], ['new', 'Новий']] as const).map(([val, lbl]) => (
                <button key={val} onClick={() => setMode(val)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium"
                  style={mode === val
                    ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }
                    : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
                  {lbl}
                </button>
              ))}
            </div>
            {mode === 'existing' ? (
              <div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук клієнта…"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm mb-2" style={inputStyle} />
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {filteredClients.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>Нікого не знайдено.</p>
                  )}
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => setClientId(c.id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl text-left"
                      style={{ background: 'var(--tg-theme-secondary-bg-color)',
                        border: clientId === c.id ? '1.5px solid var(--tg-theme-button-color)' : '1.5px solid transparent' }}>
                      <span className="text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{c.fullName}</span>
                      {c.phone && <span className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Імʼя клієнта"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Телефон (необовʼязково)"
                  type="tel" inputMode="tel"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-2 flex-shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button onClick={submit} disabled={!canSave || submitting}
            className="w-full py-4 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-40"
            style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)' }}>
            {submitting ? 'Створюємо…' : 'Записати'}
          </button>
        </div>
      </div>
    </div>
  );
}
