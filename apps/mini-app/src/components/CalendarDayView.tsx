import { useMemo, useEffect, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';

/** Мінімальна форма запису, потрібна таймлайну (сумісна зі SchedulePage). */
export interface TimelineAppointment {
  id: string;
  status: string;
  client: { fullName: string } | null;
  service: { name: string } | null;
  slot: { startAt: string; endAt: string } | null;
}

// Колір статусу для лівого маркера/фону блока (узгоджено зі STATUS_CONFIG розкладу).
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

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? 'var(--tg-theme-button-color)';
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

interface Positioned {
  apt: TimelineAppointment;
  start: number; // хвилини від початку дня
  end: number;
  col: number;
  cols: number;
}

/**
 * Розкладає записи по колонках так, щоб ті, що перетинаються в часі,
 * стояли поруч, а не накладались (як у календарі iPhone).
 */
function layout(appts: TimelineAppointment[]): Positioned[] {
  const items = appts
    .filter((a) => a.slot?.startAt && a.slot?.endAt)
    .map((a) => {
      const start = minutesOfDay(a.slot!.startAt);
      let end = minutesOfDay(a.slot!.endAt);
      if (end <= start) end = start + 30; // захист від некоректних даних
      return { apt: a, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    // Жадібне призначення колонок усередині кластера.
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

export function CalendarDayView({
  day,
  appointments,
  onSelectApt,
}: {
  day: Date;
  appointments: TimelineAppointment[];
  onSelectApt?: (apt: TimelineAppointment) => void;
}) {
  const positioned = useMemo(() => layout(appointments), [appointments]);

  // Діапазон годин: 8–20 за замовчуванням, розширюємо під фактичні записи.
  const { startHour, endHour } = useMemo(() => {
    let s = 8;
    let e = 20;
    for (const p of positioned) {
      s = Math.min(s, Math.floor(p.start / 60));
      e = Math.max(e, Math.ceil(p.end / 60));
    }
    return { startHour: Math.max(0, s), endHour: Math.min(24, Math.max(e, s + 1)) };
  }, [positioned]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const rangeStartMin = startHour * 60;
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  // Лінія «зараз» — лише коли обраний день = сьогодні.
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

  const nowTop = ((nowMin - rangeStartMin) / 60) * HOUR_HEIGHT;
  const nowVisible = isToday && nowMin >= rangeStartMin && nowMin <= endHour * 60;

  // Автоскрол до «зараз» (або до першого запису) при відкритті.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let target = 0;
    if (nowVisible) target = nowTop - 120;
    else if (positioned.length)
      target = ((positioned[0].start - rangeStartMin) / 60) * HOUR_HEIGHT - 40;
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    // один раз на зміну дня
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <div className="relative" style={{ height: totalHeight + 16 }}>
        {/* Погодинна сітка */}
        {hours.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 flex items-start"
            style={{ top: i * HOUR_HEIGHT }}>
            <span className="text-[11px] font-medium -translate-y-1.5 w-[44px] text-right pr-2"
              style={{ color: 'var(--tg-theme-hint-color)' }}>
              {String(h).padStart(2, '0')}:00
            </span>
            <div className="flex-1 border-t"
              style={{ borderColor: 'var(--tg-theme-secondary-bg-color)' }} />
          </div>
        ))}

        {/* Лінія «зараз» */}
        {nowVisible && (
          <div className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
            style={{ top: nowTop }}>
            <span className="text-[10px] font-bold w-[44px] text-right pr-2" style={{ color: '#e05c5c' }}>
              {format(new Date(), 'HH:mm')}
            </span>
            <div className="flex-1 h-px" style={{ background: '#e05c5c' }} />
            <div className="w-2 h-2 rounded-full -ml-1" style={{ background: '#e05c5c' }} />
          </div>
        )}

        {/* Блоки записів */}
        {positioned.map((p) => {
          const top = ((p.start - rangeStartMin) / 60) * HOUR_HEIGHT;
          const rawH = ((p.end - p.start) / 60) * HOUR_HEIGHT;
          const height = Math.max(rawH - 3, 26);
          const colW = `calc((100% - ${GUTTER}px) / ${p.cols})`;
          const left = `calc(${GUTTER}px + (100% - ${GUTTER}px) / ${p.cols} * ${p.col})`;
          const color = statusColor(p.apt.status);
          const canceled = p.apt.status.startsWith('cancelled');
          const compact = height < 42;
          return (
            <button key={p.apt.id} onClick={() => onSelectApt?.(p.apt)}
              className="absolute rounded-lg text-left overflow-hidden active:opacity-80 transition-opacity"
              style={{
                top,
                height,
                left,
                width: `calc(${colW} - 3px)`,
                background: `color-mix(in srgb, ${color} 14%, var(--tg-theme-bg-color))`,
                borderLeft: `3px solid ${color}`,
                opacity: canceled ? 0.55 : 1,
                padding: compact ? '2px 6px' : '4px 8px',
              }}>
              <div className="flex items-baseline gap-1.5 leading-tight">
                <span className="text-[11px] font-semibold truncate"
                  style={{ color: 'var(--tg-theme-text-color)' }}>
                  {p.apt.client?.fullName ?? 'Клієнт'}
                </span>
              </div>
              {!compact && (
                <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  {p.apt.slot && `${format(new Date(p.apt.slot.startAt), 'HH:mm')} · `}
                  {p.apt.service?.name ?? ''}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
