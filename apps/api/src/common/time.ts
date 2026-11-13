/**
 * Увесь бізнес-час — київський. Сервер (Railway) працює в UTC, тож будь-які
 * new Date(y, m, d) / setHours(...) дають межі дня в UTC, а не в Києві.
 * Ці хелпери рахують межі коректно з урахуванням літнього/зимового часу.
 */
export const APP_TZ = 'Europe/Kyiv';

/** Зсув зони (мс) відносно UTC у конкретний момент — коректно враховує DST. */
export function tzOffsetMs(timeZone: string, atUtcMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: any = Object.fromEntries(fmt.formatToParts(new Date(atUtcMs)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(atUtcMs / 1000) * 1000;
}

/**
 * "Настінний" час у зоні (напр. 09:00 у Києві) → правильний UTC-момент.
 * Друга ітерація потрібна, якщо перша здогадка перетинає межу DST.
 */
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, timeZone = APP_TZ): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let utc = utcGuess - tzOffsetMs(timeZone, utcGuess);
  utc = utcGuess - tzOffsetMs(timeZone, utc);
  return new Date(utc);
}

/** Київська дата (YYYY-MM-DD) для моменту. */
export function kyivDateStr(at: Date = new Date()): string {
  // en-CA дає формат YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** [початок, кінець) київського дня YYYY-MM-DD у UTC. */
export function kyivDayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: zonedWallTimeToUtc(dateStr, '00:00'), end: zonedWallTimeToUtc(next, '00:00') };
}

/** Початок київського місяця зі зсувом (0 — поточний, -1 — минулий, 1 — наступний). */
export function kyivMonthStart(offsetMonths = 0, at: Date = new Date()): Date {
  const [y, m] = kyivDateStr(at).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offsetMonths, 1)).toISOString().slice(0, 10);
  return zonedWallTimeToUtc(first, '00:00');
}
