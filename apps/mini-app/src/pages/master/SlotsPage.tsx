import { useState, useEffect, useRef } from 'react';
import { format, addDays, startOfDay, isSameDay, addMonths, getDaysInMonth, startOfMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Plus, Trash2, ChevronLeft, ChevronRight, CalendarDays, X, Lock } from 'lucide-react';
import { slotsApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { useUI } from '../../context/UIContext';
import { Illustration } from '../../components/Illustration';

interface Slot {
  id: string;
  startAt: string;
  endAt: string;
  isBooked: boolean;
}

const WORK_TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
const DURATIONS = [30, 45, 60, 90, 120];
const STRIP_DAYS = 60;

export default function SlotsPage() {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const { master } = useMaster();
  const masterId = master?.id ?? '';

  useEffect(() => { loadSlots(); }, [selectedDate]);

  useEffect(() => {
    if (!stripRef.current) return;
    const today = startOfDay(new Date());
    const diffDays = Math.round((selectedDate.getTime() - today.getTime()) / 86400000);
    const itemW = 56;
    stripRef.current.scrollTo({ left: Math.max(0, diffDays * itemW - 80), behavior: 'smooth' });
  }, [selectedDate]);

  async function loadSlots() {
    setLoading(true);
    try {
      const from = selectedDate.toISOString();
      const to = addDays(selectedDate, 1).toISOString();
      // Майстер бачить УСІ свої слоти (вільні + зайняті), а не лише доступні
      const data = await slotsApi.getForMaster(masterId, from, to);
      setSlots(data);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(id: string) {
    try {
      await slotsApi.delete(id, masterId);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      loadSlots();
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  }

  const today = startOfDay(new Date());

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Мої слоти</h1>
          <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {format(selectedDate, 'd MMMM', { locale: uk })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCalendar(true)}
            className="p-2 rounded-xl"
            style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
          >
            <CalendarDays size={18} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-sm font-medium"
            style={{ background: 'var(--tg-theme-button-color)' }}
          >
            <Plus size={16} /> Додати
          </button>
        </div>
      </div>

      {/* Стрічка дат — 60 днів, scrollable */}
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          onClick={() => setSelectedDate(d => addDays(d, -1))}
          className="p-1.5 rounded-xl flex-shrink-0"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div
          ref={stripRef}
          className="flex-1 flex gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {Array.from({ length: STRIP_DAYS }, (_, i) => {
            const day = addDays(today, i);
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className="flex flex-col items-center min-w-[48px] py-2 rounded-xl transition-all flex-shrink-0"
                style={isSelected
                  ? { background: 'var(--tg-theme-button-color)', color: '#fff' }
                  : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }
                }
              >
                <span className="text-[10px] opacity-70">
                  {isToday && !isSelected ? '●' : format(day, 'EEE', { locale: uk })}
                </span>
                <span className="text-sm font-bold">{format(day, 'd')}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setSelectedDate(d => addDays(d, 1))}
          className="p-1.5 rounded-xl flex-shrink-0"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Список слотів */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <span style={{ color: 'var(--tg-theme-button-color)', opacity: 0.85 }}>
              <Illustration name="slots" size={88} />
            </span>
            <p className="font-medium">Слотів немає</p>
            <p className="text-sm text-center" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Натисніть "Додати" щоб створити доступний час
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="rounded-xl p-3 flex items-center justify-between"
                style={{
                  background: slot.isBooked ? 'var(--tg-theme-bg-color)' : 'var(--tg-theme-secondary-bg-color)',
                  border: slot.isBooked ? '1px solid var(--tg-theme-hint-color)' : 'none',
                  opacity: slot.isBooked ? 0.5 : 1,
                }}
              >
                <div>
                  <p className="font-semibold text-sm">{format(new Date(slot.startAt), 'HH:mm')}</p>
                  <p className="text-xs flex items-center gap-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {slot.isBooked
                      ? (<><Lock size={11} /> Зайнято</>)
                      : `до ${format(new Date(slot.endAt), 'HH:mm')}`}
                  </p>
                </div>
                {!slot.isBooked && (
                  <button onClick={() => deleteSlot(slot.id)} className="p-1.5 rounded-lg text-red-400">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <AddSlotsSheet
          masterId={masterId}
          date={selectedDate}
          defaultWorkStart={master?.defaultWorkStart ?? '09:00'}
          defaultWorkEnd={master?.defaultWorkEnd ?? '18:00'}
          defaultSlotDuration={master?.defaultSlotDuration ?? 60}
          defaultBreakMinutes={master?.defaultBreakMinutes ?? 15}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadSlots(); }}
        />
      )}

      {showCalendar && (
        <CalendarModal
          selected={selectedDate}
          onSelect={(d) => { setSelectedDate(d); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
}

// ─── Календар ─────────────────────────────────────────────────────────────────
function CalendarModal({ selected, onSelect, onClose }: {
  selected: Date; onSelect: (d: Date) => void; onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(selected));
  const [closing, setClosing] = useState(false);
  const CLOSE_MS = 280;

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  function handleSelect(d: Date) {
    setClosing(true);
    setTimeout(() => onSelect(d), CLOSE_MS);
  }
  const today = startOfDay(new Date());
  const daysInMonth = getDaysInMonth(viewMonth);
  const firstDOW = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
  );

  return (
    <div className="fixed inset-0 flex items-end" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/50`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} relative w-full rounded-t-3xl p-5`}
        style={{ background: 'var(--tg-theme-bg-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <X size={16} />
        </button>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewMonth(m => addMonths(m, -1))} className="p-2 rounded-xl" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <ChevronLeft size={16} />
          </button>
          <span className="font-semibold capitalize">{format(viewMonth, 'LLLL yyyy', { locale: uk })}</span>
          <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-2 rounded-xl" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(d => (
            <div key={d} className="text-center text-xs py-1" style={{ color: 'var(--tg-theme-hint-color)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDOW }, (_, i) => <div key={`e${i}`} />)}
          {days.map((day) => {
            const isSel = isSameDay(day, selected);
            const isToday = isSameDay(day, today);
            const isPast = day < today;
            return (
              <button
                key={day.toISOString()}
                onClick={() => !isPast && handleSelect(day)}
                disabled={isPast}
                className="aspect-square rounded-xl text-sm font-medium flex items-center justify-center transition-all"
                style={isSel
                  ? { background: 'var(--tg-theme-button-color)', color: '#fff' }
                  : isToday
                    ? { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-button-color)', fontWeight: 700 }
                    : isPast ? { opacity: 0.25, cursor: 'default' }
                    : { color: 'var(--tg-theme-text-color)' }
                }
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
        <div className="mt-4 pb-safe">
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-xl text-sm"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom sheet для додавання слотів ───────────────────────────────────────
function AddSlotsSheet({ masterId, date, onClose, onSaved, defaultWorkStart, defaultWorkEnd, defaultSlotDuration, defaultBreakMinutes }: {
  masterId: string; date: Date; onClose: () => void; onSaved: () => void;
  defaultWorkStart: string; defaultWorkEnd: string;
  defaultSlotDuration: number; defaultBreakMinutes: number;
}) {
  const { hideNav, showNav } = useUI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const CLOSE_MS = 280;

  // Ховаємо нижню навігацію + скидаємо скрол до верху
  useEffect(() => {
    hideNav();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => showNav();
  }, []);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  function handleSaved() {
    if (closing) return;
    setClosing(true);
    setTimeout(onSaved, CLOSE_MS);
  }

  const [startTime, setStartTime] = useState(defaultWorkStart);
  const [endTime, setEndTime] = useState(defaultWorkEnd);
  const [duration, setDuration] = useState(defaultSlotDuration);
  const [breakMin, setBreakMin] = useState(defaultBreakMinutes);
  const [selectedDays, setSelectedDays] = useState<string[]>([format(date, 'yyyy-MM-dd')]);
  const [saving, setSaving] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startOfDay(new Date()), i);
    return { date: d, str: format(d, 'yyyy-MM-dd') };
  });

  function toggleDay(str: string) {
    setSelectedDays(prev => prev.includes(str) ? prev.filter(d => d !== str) : [...prev, str]);
  }

  function previewCount() {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMin <= 0) return 0;
    return Math.floor(totalMin / (duration + breakMin));
  }

  async function handleSave() {
    if (!selectedDays.length) return;
    setSaving(true);
    try {
      await slotsApi.createBulk({ masterId, dates: selectedDays, startTime, endTime, slotDurationMinutes: duration, breakMinutes: breakMin });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      handleSaved();
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setSaving(false);
    }
  }

  const totalSlots = previewCount() * selectedDays.length;



  return (
    <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/40`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col`}
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex-shrink-0 px-4 pb-2">
          <h2 className="text-lg font-bold">Додати слоти</h2>
        </div>

        {/* Scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: 'var(--tg-theme-hint-color)' }}>Дні</p>
            <div className="flex gap-2 flex-wrap">
              {weekDays.map(({ date: d, str }) => (
                <button key={str} onClick={() => toggleDay(str)}
                  className="flex flex-col items-center py-2 px-3 rounded-xl text-sm"
                  style={selectedDays.includes(str)
                    ? { background: 'var(--tg-theme-button-color)', color: '#fff' }
                    : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}
                >
                  <span className="text-xs opacity-70">{format(d, 'EEE', { locale: uk })}</span>
                  <span className="font-bold">{format(d, 'd')}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>Початок</p>
              <select value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
                {WORK_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>Кінець</p>
              <select value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
                {WORK_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: 'var(--tg-theme-hint-color)' }}>Тривалість слоту</p>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)} className="px-4 py-2 rounded-xl text-sm"
                  style={duration === d
                    ? { background: 'var(--tg-theme-button-color)', color: '#fff' }
                    : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
                  {d} хв
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Перерва між слотами: <strong>{breakMin} хв</strong>
            </p>
            <input type="range" min={0} max={60} step={5} value={breakMin}
              onChange={e => setBreakMin(+e.target.value)} className="w-full" />
          </div>

          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>Буде створено приблизно</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--tg-theme-button-color)' }}>{totalSlots}</p>
            <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
              слотів на {selectedDays.length} {selectedDays.length === 1 ? 'день' : 'дні'}
            </p>
          </div>
        </div>

        {/* Кнопка збереження */}
        <div className="flex-shrink-0 px-4 pt-2 pb-safe"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSave}
            disabled={saving || totalSlots === 0 || selectedDays.length === 0}
            className="w-full py-4 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color, #fff)',
              boxShadow: 'var(--theme-btn-shadow)',
            }}
          >
            {saving ? 'Зберігаємо...' : totalSlots > 0 ? `Створити ${totalSlots} слотів` : 'Оберіть параметри'}
          </button>
        </div>
      </div>
    </div>
  );
}
