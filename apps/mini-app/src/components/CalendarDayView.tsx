import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import { useUI } from '../context/UIContext';

/** Мінімальна форма запису, потрібна таймлайну (сумісна зі SchedulePage). */
export interface TimelineAppointment {
  id: string;
  status: string;
  client: { fullName: string } | null;
  service: { name: string } | null;
  slot: { startAt: string; endAt: string } | null;
}

/** Вільний слот — потенційна ціль переносу. */
export interface FreeSlot {
  id: string;
  startAt: string;
  endAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#ef9f27',
  confirmed: '#1d9e75',
  completed: '#9aa0a6',
  cancelled_client: '#e05c5c',
  cancelled_master: '#e05c5c',
  no_show: '#ef9f27',
};

const HOUR_HEIGHT = 64; // px на одну годину
const GUTTER = 52; // ширина колонки з підписами годин
const LONG_PRESS_MS = 300; // затримка входу в режим перетягування
const MOVE_CANCEL_PX = 8; // рух до таймера → це скрол, не драг
const SNAP_THRESHOLD_MIN = 40; // магнітимось до вільного слоту в межах ±40 хв

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? 'var(--tg-theme-button-color)';
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface Positioned {
  apt: TimelineAppointment;
  start: number;
  end: number;
  col: number;
  cols: number;
}

const DRAGGABLE = new Set(['pending', 'confirmed']);

function layout(appts: TimelineAppointment[]): Positioned[] {
  const items = appts
    .filter((a) => a.slot?.startAt && a.slot?.endAt)
    .map((a) => {
      const start = minutesOfDay(a.slot!.startAt);
      let end = minutesOfDay(a.slot!.endAt);
      if (end <= start) end = start + 30;
      return { apt: a, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (it.start >= colEnds[c]) {
          it.col = c;
          colEnds[c] = it.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = colEnds.length;
        colEnds.push(it.end);
      }
    }
    const cols = colEnds.length;
    cluster.forEach((it) => (it.cols = cols));
    result.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}

interface DragMeta {
  aptId: string;
  pointerId: number;
  grabY: number;
  origStart: number; // хвилини
  duration: number; // хвилини
}

export function CalendarDayView({
  day,
  appointments,
  freeSlots = [],
  onSelectApt,
  onReschedule,
}: {
  day: Date;
  appointments: TimelineAppointment[];
  freeSlots?: FreeSlot[];
  onSelectApt?: (apt: TimelineAppointment) => void;
  onReschedule?: (aptId: string, newSlotId: string) => Promise<void> | void;
}) {
  const positioned = useMemo(() => layout(appointments), [appointments]);

  // Вільні слоти цього дня (як цілі переносу).
  const freeToday = useMemo(
    () =>
      freeSlots
        .filter((s) => s.startAt && isSameDay(new Date(s.startAt), day))
        .map((s) => ({ id: s.id, start: minutesOfDay(s.startAt), end: minutesOfDay(s.endAt) }))
        .sort((a, b) => a.start - b.start),
    [freeSlots, day],
  );

  const { startHour, endHour } = useMemo(() => {
    let s = 8;
    let e = 20;
    for (const p of positioned) {
      s = Math.min(s, Math.floor(p.start / 60));
      e = Math.max(e, Math.ceil(p.end / 60));
    }
    for (const f of freeToday) {
      s = Math.min(s, Math.floor(f.start / 60));
      e = Math.max(e, Math.ceil(f.end / 60));
    }
    return { startHour: Math.max(0, s), endHour: Math.min(24, Math.max(e, s + 1)) };
  }, [positioned, freeToday]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const rangeStartMin = startHour * 60;
  const rangeEndMin = endHour * 60;
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  const minToTop = (min: number) => ((min - rangeStartMin) / 60) * HOUR_HEIGHT;

  // ── Лінія «зараз» ─────────────────────────────────────────────────────────
  const isToday = isSameDay(day, new Date());
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, [isToday]);
  const nowVisible = isToday && nowMin >= rangeStartMin && nowMin <= rangeEndMin;

  // ── Автоскрол ─────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let target = 0;
    if (nowVisible) target = minToTop(nowMin) - 120;
    else if (positioned.length) target = minToTop(positioned[0].start) - 40;
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // ── Перетягування ─────────────────────────────────────────────────────────
  const dragRef = useRef<DragMeta | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const startedDragRef = useRef(false);

  const [phase, setPhase] = useState<'idle' | 'dragging' | 'confirm'>('idle');
  const [dragAptId, setDragAptId] = useState<string | null>(null);
  const [curStart, setCurStart] = useState(0); // поточний старт (хв) під час драгу
  const [targetSlot, setTargetSlot] = useState<{ id: string; start: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Поки триває драг/підтвердження — ховаємо нижнє меню (інакше панель ховається за ним).
  const { hideNav, showNav } = useUI();
  useEffect(() => {
    if (phase !== 'idle') hideNav();
    else showNav();
  }, [phase, hideNav, showNav]);
  // Страховка: повертаємо меню, якщо компонент розмонтувався під час драгу.
  useEffect(() => () => showNav(), [showNav]);

  const haptic = (type: 'light' | 'medium' | 'heavy' = 'light') =>
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);

  const clearPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const nearestFreeSlot = useCallback(
    (startMin: number): { id: string; start: number } | null => {
      let best: { id: string; start: number } | null = null;
      let bestDiff = Infinity;
      for (const f of freeToday) {
        const diff = Math.abs(f.start - startMin);
        if (diff < bestDiff) { bestDiff = diff; best = { id: f.id, start: f.start }; }
      }
      return best && bestDiff <= SNAP_THRESHOLD_MIN ? best : null;
    },
    [freeToday],
  );

  const onBlockPointerDown = (e: React.PointerEvent, p: Positioned) => {
    if (phase !== 'idle') return;
    downPos.current = { x: e.clientX, y: e.clientY };
    startedDragRef.current = false;
    const canDrag = DRAGGABLE.has(p.apt.status) && !!onReschedule;
    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    if (canDrag) {
      pressTimer.current = setTimeout(() => {
        // Вхід у режим перетягування.
        startedDragRef.current = true;
        dragRef.current = {
          aptId: p.apt.id,
          pointerId,
          grabY: downPos.current!.y,
          origStart: p.start,
          duration: p.end - p.start,
        };
        try { target.setPointerCapture(pointerId); } catch { /* ignore */ }
        haptic('medium');
        setDragAptId(p.apt.id);
        setCurStart(p.start);
        setTargetSlot(nearestFreeSlot(p.start));
        setPhase('dragging');
      }, LONG_PRESS_MS);
    }
  };

  const onBlockPointerMove = (e: React.PointerEvent, p: Positioned) => {
    // До входу в драг: якщо палець зрушив — це скрол, скасовуємо long-press.
    if (!startedDragRef.current) {
      if (downPos.current) {
        const dx = Math.abs(e.clientX - downPos.current.x);
        const dy = Math.abs(e.clientY - downPos.current.y);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPress();
      }
      return;
    }
    // У дразі — рухаємо блок.
    const meta = dragRef.current;
    if (!meta) return;
    e.preventDefault();
    const dyMin = ((e.clientY - meta.grabY) / HOUR_HEIGHT) * 60;
    let next = meta.origStart + dyMin;
    next = Math.max(rangeStartMin, Math.min(next, rangeEndMin - meta.duration));
    const snap = nearestFreeSlot(next);
    setTargetSlot(snap);
    setCurStart(snap ? snap.start : next);
  };

  const onBlockPointerUp = (e: React.PointerEvent, p: Positioned) => {
    clearPress();
    if (!startedDragRef.current) {
      // Це був тап (не драг) — відкриваємо деталі.
      const dx = downPos.current ? Math.abs(e.clientX - downPos.current.x) : 0;
      const dy = downPos.current ? Math.abs(e.clientY - downPos.current.y) : 0;
      if (dx <= MOVE_CANCEL_PX && dy <= MOVE_CANCEL_PX) onSelectApt?.(p.apt);
      return;
    }
    // Кінець драгу.
    startedDragRef.current = false;
    const meta = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const changed =
      targetSlot && meta && Math.abs(targetSlot.start - meta.origStart) >= 1;
    if (changed) {
      haptic('heavy');
      setPhase('confirm');
    } else {
      // Немає валідної цілі — плавно повертаємось.
      resetDrag();
    }
  };

  const resetDrag = () => {
    setPhase('idle');
    setDragAptId(null);
    setTargetSlot(null);
    startedDragRef.current = false;
    dragRef.current = null;
  };

  const handleSave = async () => {
    if (!dragAptId || !targetSlot || !onReschedule) return resetDrag();
    setSaving(true);
    try {
      await onReschedule(dragAptId, targetSlot.id);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
      resetDrag();
    } catch {
      // Помилку показує SchedulePage; лишаємось у confirm, щоб можна було повторити.
    } finally {
      setSaving(false);
    }
  };

  const dragActive = phase === 'dragging' || phase === 'confirm';

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-2 relative"
      style={{
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        touchAction: dragActive ? 'none' : 'pan-y',
      } as React.CSSProperties}
    >
      <div className="relative" style={{ height: totalHeight + 16 }}>
        {/* Погодинна сітка */}
        {hours.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 flex items-start"
            style={{ top: i * HOUR_HEIGHT, zIndex: dragActive ? 30 : 1 }}>
            <span className="text-[11px] font-medium -translate-y-1.5 w-[44px] text-right pr-2"
              style={{
                color: dragActive ? 'var(--tg-theme-text-color)' : 'var(--tg-theme-hint-color)',
                fontWeight: dragActive ? 700 : 500,
              }}>
              {String(h).padStart(2, '0')}:00
            </span>
            <div className="flex-1 border-t"
              style={{ borderColor: 'var(--tg-theme-secondary-bg-color)' }} />
          </div>
        ))}

        {/* Затемнення-фокус під час драгу */}
        {dragActive && (
          <div className="absolute inset-0 z-20"
            style={{
              background: 'var(--tg-theme-bg-color)',
              opacity: 0.55,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }} />
        )}

        {/* Вільні слоти — підсвічені зони скидання під час драгу */}
        {dragActive && freeToday.map((f) => {
          const active = targetSlot?.id === f.id;
          return (
            <div key={f.id} className="absolute rounded-lg z-20 pointer-events-none transition-all"
              style={{
                top: minToTop(f.start),
                height: Math.max(((f.end - f.start) / 60) * HOUR_HEIGHT - 3, 22),
                left: GUTTER,
                right: 0,
                border: `1.5px dashed ${active ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)'}`,
                background: active ? 'color-mix(in srgb, var(--tg-theme-button-color) 16%, transparent)' : 'transparent',
                opacity: active ? 1 : 0.5,
              }} />
          );
        })}

        {/* Лінія «зараз» */}
        {nowVisible && !dragActive && (
          <div className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
            style={{ top: minToTop(nowMin) }}>
            <span className="text-[10px] font-bold w-[44px] text-right pr-2" style={{ color: '#e05c5c' }}>
              {format(new Date(), 'HH:mm')}
            </span>
            <div className="flex-1 h-px" style={{ background: '#e05c5c' }} />
            <div className="w-2 h-2 rounded-full -ml-1" style={{ background: '#e05c5c' }} />
          </div>
        )}

        {/* Блоки записів */}
        {positioned.map((p) => {
          const isDragged = dragAptId === p.apt.id;
          const top = isDragged ? minToTop(curStart) : minToTop(p.start);
          const rawH = ((p.end - p.start) / 60) * HOUR_HEIGHT;
          const height = Math.max(rawH - 3, 26);
          const colW = isDragged
            ? `calc(100% - ${GUTTER}px)`
            : `calc((100% - ${GUTTER}px) / ${p.cols})`;
          const left = isDragged
            ? `${GUTTER}px`
            : `calc(${GUTTER}px + (100% - ${GUTTER}px) / ${p.cols} * ${p.col})`;
          const color = statusColor(p.apt.status);
          const canceled = p.apt.status.startsWith('cancelled');
          const compact = height < 42;
          // Під час драгу все, крім активного блока, тьмяніє й розмивається.
          const dimmed = dragActive && !isDragged;
          return (
            <div
              key={p.apt.id}
              onPointerDown={(e) => onBlockPointerDown(e, p)}
              onPointerMove={(e) => onBlockPointerMove(e, p)}
              onPointerUp={(e) => onBlockPointerUp(e, p)}
              onPointerCancel={() => { clearPress(); if (startedDragRef.current) resetDrag(); }}
              className="absolute rounded-lg text-left overflow-hidden select-none"
              style={{
                top,
                height,
                left,
                width: `calc(${colW} - 3px)`,
                background: `color-mix(in srgb, ${color} 14%, var(--tg-theme-bg-color))`,
                borderLeft: `3px solid ${color}`,
                opacity: canceled ? 0.55 : dimmed ? 0.35 : 1,
                padding: compact ? '2px 6px' : '4px 8px',
                zIndex: isDragged ? 40 : dimmed ? 1 : 5,
                filter: dimmed ? 'blur(1.5px)' : 'none',
                transform: isDragged ? 'scale(1.02)' : 'none',
                boxShadow: isDragged ? '0 10px 30px rgba(0,0,0,0.28)' : 'none',
                transition: phase === 'confirm' ? 'top 0.15s ease' : 'none',
                touchAction: 'none',
                cursor: 'grab',
              }}>
              <div className="flex items-baseline gap-1.5 leading-tight">
                <span className="text-[11px] font-semibold truncate"
                  style={{ color: 'var(--tg-theme-text-color)' }}>
                  {p.apt.client?.fullName ?? 'Клієнт'}
                </span>
              </div>
              {(!compact || isDragged) && (
                <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  {isDragged
                    ? `${fmtMin(curStart)}–${fmtMin(curStart + (p.end - p.start))}`
                    : `${p.apt.slot ? format(new Date(p.apt.slot.startAt), 'HH:mm') + ' · ' : ''}${p.apt.service?.name ?? ''}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Підказка під час драгу */}
      {phase === 'dragging' && (
        <div className="fixed left-0 right-0 bottom-0 z-50 px-5 py-3 text-center text-xs font-medium pointer-events-none"
          style={{ color: 'var(--tg-theme-hint-color)' }}>
          {targetSlot
            ? `Відпусти на ${fmtMin(targetSlot.start)}`
            : freeToday.length
              ? 'Тягни до вільного вікна'
              : 'Немає вільних вікон — створи слот на екрані «Слоти»'}
        </div>
      )}

      {/* Панель підтвердження */}
      {phase === 'confirm' && targetSlot && (
        <div className="fixed left-0 right-0 bottom-0 z-50 p-4 bb-slide-up"
          style={{ background: 'var(--tg-theme-bg-color)', boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
          <p className="text-center text-sm mb-3" style={{ color: 'var(--tg-theme-text-color)' }}>
            Перенести запис на <b>{fmtMin(targetSlot.start)}</b>?
            <span className="block text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Клієнт отримає повідомлення про новий час
            </span>
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <button onClick={resetDrag} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
              Скасувати
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                boxShadow: 'var(--theme-btn-shadow)',
                opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Зберігаю…' : 'Зберегти'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
