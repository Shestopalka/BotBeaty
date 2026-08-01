import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

/** Вільний слот — щоб не кидати запис на вже зайнятий системою час. */
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

const HOUR_HEIGHT = 64;
const GUTTER = 52;
const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 8;
const SNAP_MIN = 15;
const INVALID = '#e05c5c';
const EASE = 'cubic-bezier(0.32,0.72,0,1)';

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
function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && aE > bS;
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
        if (it.start >= colEnds[c]) { it.col = c; colEnds[c] = it.end; placed = true; break; }
      }
      if (!placed) { it.col = colEnds.length; colEnds.push(it.end); }
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
  origStart: number;
  duration: number;
}

export function CalendarDayView({
  day,
  appointments,
  freeSlots = [],
  onSelectApt,
  onRescheduleTime,
}: {
  day: Date;
  appointments: TimelineAppointment[];
  freeSlots?: FreeSlot[];
  onSelectApt?: (apt: TimelineAppointment) => void;
  onRescheduleTime?: (aptId: string, newStartISO: string) => Promise<void> | void;
}) {
  const positioned = useMemo(() => layout(appointments), [appointments]);

  const freeToday = useMemo(
    () =>
      freeSlots
        .filter((s) => s.startAt && isSameDay(new Date(s.startAt), day))
        .map((s) => ({ start: minutesOfDay(s.startAt), end: minutesOfDay(s.endAt) })),
    [freeSlots, day],
  );

  const { startHour, endHour } = useMemo(() => {
    let s = 8, e = 20;
    for (const p of positioned) { s = Math.min(s, Math.floor(p.start / 60)); e = Math.max(e, Math.ceil(p.end / 60)); }
    for (const f of freeToday) { s = Math.min(s, Math.floor(f.start / 60)); e = Math.max(e, Math.ceil(f.end / 60)); }
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
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()); }, 60000);
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
  const [curStart, setCurStart] = useState(0);
  const [validDrop, setValidDrop] = useState(true);
  const [lift, setLift] = useState(false);        // плавне «відшарування» блока
  const [panelUp, setPanelUp] = useState(false);   // панель виїжджає ПІСЛЯ повернення фону
  const [panelClosing, setPanelClosing] = useState(false);
  const [saving, setSaving] = useState(false);

  const dragActive = phase === 'dragging' || phase === 'confirm';
  const blurred = phase === 'dragging'; // фон розмитий лише поки тягнемо; у confirm — повертається

  const { hideNav, showNav } = useUI();
  useEffect(() => { if (phase !== 'idle') hideNav(); else showNav(); }, [phase, hideNav, showNav]);
  useEffect(() => () => showNav(), [showNav]);

  // Плавне підняття/осідання блока + послідовний вихід панелі.
  useEffect(() => {
    if (phase === 'dragging') {
      const id = requestAnimationFrame(() => setLift(true));
      return () => cancelAnimationFrame(id);
    }
    if (phase === 'confirm') {
      setLift(false); // блок плавно осідає на місце
      const id = setTimeout(() => setPanelUp(true), 200); // потім виїжджає панель
      return () => clearTimeout(id);
    }
    setLift(false);
    setPanelUp(false);
  }, [phase]);

  const haptic = (type: 'light' | 'medium' | 'heavy' = 'light') =>
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
  const clearPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };

  const isValid = useCallback(
    (startMin: number, dur: number, exceptId: string): boolean => {
      const end = startMin + dur;
      if (startMin < rangeStartMin || end > rangeEndMin) return false;
      for (const p of positioned) { if (p.apt.id === exceptId) continue; if (overlaps(startMin, end, p.start, p.end)) return false; }
      for (const f of freeToday) { if (overlaps(startMin, end, f.start, f.end)) return false; }
      return true;
    },
    [positioned, freeToday, rangeStartMin, rangeEndMin],
  );

  const dayAtMinutes = (min: number): string => {
    const d = new Date(day);
    d.setHours(Math.floor(min / 60), Math.round(min % 60), 0, 0);
    return d.toISOString();
  };

  const resetDrag = () => {
    setPhase('idle');
    setDragAptId(null);
    setPanelClosing(false);
    startedDragRef.current = false;
    dragRef.current = null;
  };

  const onBlockPointerDown = (e: React.PointerEvent, p: Positioned) => {
    if (phase !== 'idle') return;
    downPos.current = { x: e.clientX, y: e.clientY };
    startedDragRef.current = false;
    const canDrag = DRAGGABLE.has(p.apt.status) && !!onRescheduleTime;
    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    if (canDrag) {
      pressTimer.current = setTimeout(() => {
        startedDragRef.current = true;
        dragRef.current = { aptId: p.apt.id, pointerId, grabY: downPos.current!.y, origStart: p.start, duration: p.end - p.start };
        try { target.setPointerCapture(pointerId); } catch { /* ignore */ }
        haptic('medium');
        setDragAptId(p.apt.id);
        setCurStart(p.start);
        setValidDrop(true);
        setLift(false);
        setPhase('dragging');
      }, LONG_PRESS_MS);
    }
  };

  const onBlockPointerMove = (e: React.PointerEvent) => {
    if (!startedDragRef.current) {
      if (downPos.current) {
        const dx = Math.abs(e.clientX - downPos.current.x);
        const dy = Math.abs(e.clientY - downPos.current.y);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPress();
      }
      return;
    }
    const meta = dragRef.current;
    if (!meta) return;
    e.preventDefault();
    const dyMin = ((e.clientY - meta.grabY) / HOUR_HEIGHT) * 60;
    let next = meta.origStart + dyMin;
    next = Math.round(next / SNAP_MIN) * SNAP_MIN;
    next = Math.max(rangeStartMin, Math.min(next, rangeEndMin - meta.duration));
    setCurStart(next);
    setValidDrop(isValid(next, meta.duration, meta.aptId));
  };

  const onBlockPointerUp = (e: React.PointerEvent, p: Positioned) => {
    clearPress();
    if (!startedDragRef.current) {
      const dx = downPos.current ? Math.abs(e.clientX - downPos.current.x) : 0;
      const dy = downPos.current ? Math.abs(e.clientY - downPos.current.y) : 0;
      if (dx <= MOVE_CANCEL_PX && dy <= MOVE_CANCEL_PX) onSelectApt?.(p.apt);
      return;
    }
    startedDragRef.current = false;
    const meta = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const changed = meta && Math.abs(curStart - meta.origStart) >= 1;
    if (changed && validDrop) { haptic('heavy'); setPhase('confirm'); }
    else resetDrag();
  };

  const slideOutThen = (fn: () => void) => {
    setPanelUp(false);
    setPanelClosing(true);
    setTimeout(() => fn(), 280);
  };

  const handleCancel = () => {
    const meta = draggedPos;
    if (meta) setCurStart(meta.start); // блок плавно повертається на місце
    slideOutThen(resetDrag);
  };

  const handleSave = async () => {
    const aptId = dragAptId;
    const start = curStart;
    if (!aptId || !onRescheduleTime) return resetDrag();
    setSaving(true);
    try {
      await onRescheduleTime(aptId, dayAtMinutes(start));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
      slideOutThen(resetDrag);
    } catch {
      /* помилку показує SchedulePage; лишаємось у confirm для повтору */
    } finally {
      setSaving(false);
    }
  };

  const draggedPos = positioned.find((p) => p.apt.id === dragAptId) || null;

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
        {/* ── БАЗОВИЙ ШАР: плавно розмивається під час драгу ──────────────── */}
        <div style={{
          filter: `blur(${blurred ? 3.5 : 0}px)`,
          opacity: blurred ? 0.72 : 1,
          transition: `filter 0.28s ${EASE}, opacity 0.28s ${EASE}`,
          willChange: 'filter, opacity',
        }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: i * HOUR_HEIGHT }}>
              <span className="text-[11px] font-medium -translate-y-1.5 w-[44px] text-right pr-2"
                style={{ color: 'var(--tg-theme-hint-color)' }}>
                {String(h).padStart(2, '0')}:00
              </span>
              <div className="flex-1 border-t" style={{ borderColor: 'var(--tg-theme-secondary-bg-color)' }} />
            </div>
          ))}

          {nowVisible && (
            <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: minToTop(nowMin) }}>
              <span className="text-[10px] font-bold w-[44px] text-right pr-2" style={{ color: '#e05c5c' }}>
                {format(new Date(), 'HH:mm')}
              </span>
              <div className="flex-1 h-px" style={{ background: '#e05c5c' }} />
              <div className="w-2 h-2 rounded-full -ml-1" style={{ background: '#e05c5c' }} />
            </div>
          )}

          {positioned.map((p) => {
            const isDragged = dragAptId === p.apt.id;
            const top = minToTop(p.start);
            const height = Math.max(((p.end - p.start) / 60) * HOUR_HEIGHT - 3, 26);
            const colW = `calc((100% - ${GUTTER}px) / ${p.cols})`;
            const left = `calc(${GUTTER}px + (100% - ${GUTTER}px) / ${p.cols} * ${p.col})`;
            const color = statusColor(p.apt.status);
            const canceled = p.apt.status.startsWith('cancelled');
            const compact = height < 42;
            return (
              <div
                key={p.apt.id}
                onPointerDown={(e) => onBlockPointerDown(e, p)}
                onPointerMove={onBlockPointerMove}
                onPointerUp={(e) => onBlockPointerUp(e, p)}
                onPointerCancel={() => { clearPress(); if (startedDragRef.current) resetDrag(); }}
                className="absolute rounded-lg text-left overflow-hidden select-none"
                style={{
                  top, height, left, width: `calc(${colW} - 3px)`,
                  background: `color-mix(in srgb, ${color} 14%, var(--tg-theme-bg-color))`,
                  borderLeft: `3px solid ${color}`,
                  opacity: canceled ? 0.55 : isDragged ? 0 : 1, // оригінал ховаємо, поки тягнемо копію
                  padding: compact ? '2px 6px' : '4px 8px',
                  touchAction: 'none',
                  cursor: 'grab',
                }}>
                <div className="flex items-baseline gap-1.5 leading-tight">
                  <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--tg-theme-text-color)' }}>
                    {p.apt.client?.fullName ?? 'Клієнт'}
                  </span>
                </div>
                {!compact && (
                  <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {p.apt.slot ? format(new Date(p.apt.slot.startAt), 'HH:mm') + ' · ' : ''}{p.apt.service?.name ?? ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── ГОСТРИЙ ШАР: години у фокусі + піднятий запис ───────────────── */}
        {dragActive && draggedPos && (() => {
          const dur = draggedPos.end - draggedPos.start;
          const top = minToTop(curStart);
          const height = Math.max((dur / 60) * HOUR_HEIGHT - 3, 30);
          const color = validDrop ? statusColor(draggedPos.apt.status) : INVALID;
          return (
            <>
              {/* Яскраві години зліва — плавно проявляються й трохи збільшуються */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ animation: `bb-cal-focus 0.28s ${EASE} both` }}>
                {hours.map((h, i) => (
                  <span key={`hl-${h}`}
                    className="absolute text-[11px] font-bold text-right pr-2"
                    style={{ top: i * HOUR_HEIGHT - 6, left: 0, width: 44, color: 'var(--tg-theme-text-color)' }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              {/* Піднятий (відшарований) запис — плавно росте/осідає */}
              <div
                style={{
                  position: 'absolute', top, left: GUTTER, width: `calc(100% - ${GUTTER}px - 3px)`, height,
                  background: `color-mix(in srgb, ${color} 20%, var(--tg-theme-bg-color))`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 10, padding: '4px 8px', zIndex: 40,
                  transform: lift ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: lift ? '0 16px 36px rgba(0,0,0,0.34)' : '0 2px 8px rgba(0,0,0,0.12)',
                  transition: `transform 0.24s ${EASE}, box-shadow 0.24s ${EASE}, top 0.24s ${EASE}`,
                  pointerEvents: 'none',
                }}>
                <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--tg-theme-text-color)' }}>
                  {draggedPos.apt.client?.fullName ?? 'Клієнт'}
                </div>
                <div className="text-[10px] font-bold mt-0.5" style={{ color }}>
                  {fmtMin(curStart)}–{fmtMin(curStart + dur)}{!validDrop ? ' · зайнято' : ''}
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Підказка під час драгу ─────────────────────────────────────────── */}
      {phase === 'dragging' && createPortal(
        <div className="fixed left-0 right-0 bottom-0 z-[60] px-5 pb-6 pt-3 text-center text-xs font-medium pointer-events-none bb-toast-in"
          style={{ color: validDrop ? 'var(--tg-theme-hint-color)' : INVALID }}>
          {validDrop ? 'Відпусти, щоб перенести сюди' : 'Цей час зайнятий — обери порожній'}
        </div>,
        document.body,
      )}

      {/* ── Панель підтвердження: виїжджає після осідання, ховається плавно ── */}
      {phase === 'confirm' && draggedPos && createPortal(
        <div className={`fixed left-0 right-0 bottom-0 z-[60] p-4 ${panelClosing ? 'bb-sheet-out' : panelUp ? 'bb-sheet' : ''}`}
          style={{
            background: 'var(--tg-theme-bg-color)',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
            transform: panelUp || panelClosing ? undefined : 'translateY(100%)',
            visibility: panelUp || panelClosing ? 'visible' : 'hidden',
          }}>
          <p className="text-center text-sm mb-3" style={{ color: 'var(--tg-theme-text-color)' }}>
            Перенести запис на <b>{fmtMin(curStart)}</b>?
            <span className="block text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Клієнт отримає повідомлення про новий час
            </span>
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <button onClick={handleCancel} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
              Скасувати
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', boxShadow: 'var(--theme-btn-shadow)', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Зберігаю…' : 'Зберегти'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
