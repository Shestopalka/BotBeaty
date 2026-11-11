/**
 * Увесь час у застосунку — київський (так само рахує бекенд і пише бот).
 *
 * Чому: date-fns `format(new Date(iso), 'HH:mm')` показує час у поясі ТЕЛЕФОНА.
 * На Закарпатті телефони часто стоять на CET (UTC+1) — і слот 10:00 за Києвом
 * у застосунку виглядав як 09:00, а бот писав 10:00.
 *
 * Конвенція: «wall-Date» — це Date, чиї ЛОКАЛЬНІ поля (рік/місяць/день/год/хв)
 * дорівнюють київському настінному часу. З такими датами спокійно працюють
 * format / isSameDay / startOfDay / addDays з date-fns. На бекенд завжди
 * відправляємо справжній момент: `kyivIso(wall)`.
 */

export const APP_TZ = 'Europe/Kyiv';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function kyivParts(ms: number) {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    y: +p.year, mo: +p.month, d: +p.day,
    h: +p.hour === 24 ? 0 : +p.hour, mi: +p.minute, s: +p.second,
  };
}

/** Справжній момент (ISO / Date / ms) → wall-Date з київськими полями. */
export function toKyiv(input: string | number | Date): Date {
  const ms = new Date(input).getTime();
  const k = kyivParts(ms);
  return new Date(k.y, k.mo - 1, k.d, k.h, k.mi, k.s, ms % 1000 < 0 ? 0 : ms % 1000);
}

/** wall-Date (київські поля) → справжній момент. Коректно з літнім/зимовим часом. */
export function fromKyiv(wall: Date): Date {
  const guess = Date.UTC(
    wall.getFullYear(), wall.getMonth(), wall.getDate(),
    wall.getHours(), wall.getMinutes(), wall.getSeconds(), wall.getMilliseconds(),
  );
  // Зсув Києва відносно UTC у цей момент (2 або 3 год).
  const offset = (ms: number) => {
    const k = kyivParts(ms);
    return Date.UTC(k.y, k.mo - 1, k.d, k.h, k.mi, k.s) - Math.floor(ms / 1000) * 1000;
  };
  let utc = guess - offset(guess);
  // Друга ітерація — на випадок, якщо перша здогадка перетнула межу DST.
  utc = guess - offset(utc);
  return new Date(utc);
}

/** wall-Date → ISO-рядок справжнього моменту (для from/to у запитах). */
export function kyivIso(wall: Date): string {
  return fromKyiv(wall).toISOString();
}

/** Зараз у Києві (wall-Date). */
export function kyivNow(): Date {
  return toKyiv(Date.now());
}

/** Початок сьогоднішнього дня в Києві (wall-Date, 00:00). */
export function kyivToday(): Date {
  const n = kyivNow();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
