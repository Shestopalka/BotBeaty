import { useState } from 'react';
import { format, addMonths, getDaysInMonth, startOfDay, isSameDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Модалка-календар із вибором дати. markedDays — набір дат 'yyyy-MM-dd',
 * які треба позначити крапкою (напр. дні із записами).
 */
export function CalendarModal({ selected, onSelect, onClose, markedDays }: {
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  markedDays?: Set<string>;
}) {
  const [closing, setClosing] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfDay(selected));
  const CLOSE_MS = 280;

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }
  function pick(d: Date) {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onSelect(d), CLOSE_MS);
  }

  const today = startOfDay(new Date());
  const daysInMonth = getDaysInMonth(viewMonth);
  const firstDOW = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1));

  return (
    <div className="fixed inset-0 flex items-end" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/50`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} relative w-full rounded-t-3xl p-5`}
        style={{ background: 'var(--tg-theme-bg-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-2">
          <button onClick={handleClose} className="p-2 rounded-xl"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewMonth(m => addMonths(m, -1))} className="p-2 rounded-xl" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <ChevronLeft size={16} />
          </button>
          <span className="font-semibold capitalize" style={{ color: 'var(--tg-theme-text-color)' }}>
            {format(viewMonth, 'LLLL yyyy', { locale: uk })}
          </span>
          <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-2 rounded-xl" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(d => (
            <div key={d} className="text-center text-xs py-1" style={{ color: 'var(--tg-theme-hint-color)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          {Array.from({ length: firstDOW }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(d => {
            const sel = isSameDay(d, selected);
            const isToday = isSameDay(d, today);
            const marked = markedDays?.has(format(d, 'yyyy-MM-dd'));
            return (
              <button key={d.toISOString()} onClick={() => pick(d)}
                className="relative aspect-square rounded-xl flex items-center justify-center text-sm font-medium"
                style={sel
                  ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }
                  : { background: 'var(--tg-theme-secondary-bg-color)', color: isToday ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-text-color)' }}>
                {format(d, 'd')}
                {marked && (
                  <span className="absolute" style={{
                    bottom: 6, width: 6, height: 6, borderRadius: 9999,
                    background: sel ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-button-color)',
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
