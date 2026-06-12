import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Bell, BellOff, Calendar, Clock, Zap, Ban, Lock } from 'lucide-react';
import { THEMES, ThemeName, applyTheme, getSavedTheme } from '../../themes';
import { mastersApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { isProPlus } from '../../lib/entitlements';

const ACCENT_SWATCHES = ['#d4537e', '#e8748a', '#c84070', '#a8546f', '#7a5af8', '#1d9e75', '#d85a30'];

// ─── Reusable components ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 mt-6 first:mt-0 px-1"
      style={{ color: 'var(--tg-theme-hint-color)' }}>
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
      {children}
    </div>
  );
}

function Row({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5"
      style={{ borderBottom: border ? '0.5px solid var(--tg-theme-hint-color)22' : 'none' }}>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative shrink-0 rounded-full transition-all"
      style={{
        width: 48, height: 28,
        background: value ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)44',
        transition: 'background 0.2s',
      }}>
      <span
        className="absolute top-1 rounded-full bg-white"
        style={{
          width: 20, height: 20,
          left: value ? 26 : 4,
          transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
    </button>
  );
}

function HourPicker({
  value, options, onChange,
}: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(h => (
        <button
          key={h}
          onClick={() => onChange(h)}
          className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background: value === h ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-bg-color)',
            color: value === h ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
            border: `1.5px solid ${value === h ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)33'}`,
          }}>
          {h}г
        </button>
      ))}
    </div>
  );
}

function TimePicker({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-xl text-sm font-medium"
      style={{
        background: 'var(--tg-theme-bg-color)',
        color: 'var(--tg-theme-text-color)',
        border: '1.5px solid var(--tg-theme-hint-color)33',
        outline: 'none',
      }}
    />
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { master, refresh } = useMaster();
  const masterId = master?.id ?? '';

  // ── Theme ──
  const initialTheme: ThemeName =
    (master?.theme && master.theme in THEMES)
      ? (master.theme as ThemeName)
      : getSavedTheme();
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(initialTheme);

  // ── Notifications ──
  const [rem1Enabled, setRem1Enabled] = useState(master?.reminder1Enabled ?? true);
  const [rem1Hours,   setRem1Hours]   = useState(master?.reminder1Hours ?? 24);
  const [rem2Enabled, setRem2Enabled] = useState(master?.reminder2Enabled ?? true);
  const [rem2Hours,   setRem2Hours]   = useState(master?.reminder2Hours ?? 2);

  // ── Booking ──
  const [autoConfirm,       setAutoConfirm]       = useState(master?.autoConfirm ?? false);
  const [cancellationHours, setCancellationHours] = useState(master?.cancellationHours ?? 0);
  const [maxPerDay,         setMaxPerDay]         = useState(master?.maxBookingsPerDayPerClient ?? 1);

  // ── Брендинг (Pro/Year) ──
  const [accentColor, setAccentColor] = useState(master?.accentColor ?? '');
  const canBrand = isProPlus(master);

  // ── Slot defaults ──
  const [workStart,    setWorkStart]    = useState(master?.defaultWorkStart ?? '09:00');
  const [workEnd,      setWorkEnd]      = useState(master?.defaultWorkEnd ?? '18:00');
  const [slotDuration, setSlotDuration] = useState(master?.defaultSlotDuration ?? 60);
  const [breakMinutes, setBreakMinutes] = useState(master?.defaultBreakMinutes ?? 15);

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [barClosing, setBarClosing] = useState(false);

  function handleThemeSelect(name: ThemeName) {
    setCurrentTheme(name);
    applyTheme(name);
    setSaved(false);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }

  async function saveAll() {
    setSaving(true);
    try {
      await mastersApi.update(masterId, {
        theme: currentTheme,
        reminder1Enabled: rem1Enabled,
        reminder1Hours:   rem1Hours,
        reminder2Enabled: rem2Enabled,
        reminder2Hours:   rem2Hours,
        autoConfirm,
        cancellationHours,
        maxBookingsPerDayPerClient: maxPerDay,
        accentColor: accentColor || null,
        defaultWorkStart:    workStart,
        defaultWorkEnd:      workEnd,
        defaultSlotDuration: slotDuration,
        defaultBreakMinutes: breakMinutes,
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Оновлюємо профіль у контексті, щоб «незбережені зміни» зникли.
      refresh().catch(() => {});
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setSaving(false);
    }
  }

  const dirty = !!master && (
    currentTheme !== master.theme ||
    rem1Enabled !== master.reminder1Enabled ||
    rem1Hours !== master.reminder1Hours ||
    rem2Enabled !== master.reminder2Enabled ||
    rem2Hours !== master.reminder2Hours ||
    autoConfirm !== master.autoConfirm ||
    cancellationHours !== master.cancellationHours ||
    maxPerDay !== master.maxBookingsPerDayPerClient ||
    (accentColor || '') !== (master.accentColor || '') ||
    workStart !== master.defaultWorkStart ||
    workEnd !== master.defaultWorkEnd ||
    slotDuration !== master.defaultSlotDuration ||
    breakMinutes !== master.defaultBreakMinutes
  );

  // Плавне зникнення бара при «Скасувати»: спершу анімація вгору, потім скидання.
  function closeBar() {
    if (barClosing) return;
    setBarClosing(true);
    setTimeout(() => { discard(); setBarClosing(false); }, 300);
  }

  function discard() {
    if (!master) return;
    const t = (master.theme && master.theme in THEMES ? master.theme : currentTheme) as ThemeName;
    setCurrentTheme(t); applyTheme(t);
    setRem1Enabled(master.reminder1Enabled); setRem1Hours(master.reminder1Hours);
    setRem2Enabled(master.reminder2Enabled); setRem2Hours(master.reminder2Hours);
    setAutoConfirm(master.autoConfirm); setCancellationHours(master.cancellationHours);
    setMaxPerDay(master.maxBookingsPerDayPerClient);
    setAccentColor(master.accentColor ?? '');
    setWorkStart(master.defaultWorkStart); setWorkEnd(master.defaultWorkEnd);
    setSlotDuration(master.defaultSlotDuration); setBreakMinutes(master.defaultBreakMinutes);
  }

  return (
    <div className="flex flex-col px-4 pt-6 pb-12">
      {/* Sticky save-бар — зʼявляється лише за наявності незбережених змін */}
      {(dirty || barClosing) && (
        <div className={barClosing ? 'bb-slide-up-out' : 'bb-slide-down'} style={{
          position: 'sticky', top: 0, zIndex: 30,
          margin: '-24px -16px 14px', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--tg-theme-secondary-bg-color)',
          borderBottom: '0.5px solid var(--theme-glow-color)',
          boxShadow: 'var(--theme-shadow)',
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--tg-theme-text-color)' }}>
            Незбережені зміни
          </span>
          <button onClick={closeBar} disabled={saving || barClosing}
            style={{ fontSize: 13, padding: '7px 12px', borderRadius: 10, color: 'var(--tg-theme-hint-color)', background: 'transparent' }}>
            Скасувати
          </button>
          <button onClick={saveAll} disabled={saving}
            style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 10,
              color: 'var(--tg-theme-button-text-color)', background: 'var(--tg-theme-button-color)',
              boxShadow: 'var(--theme-btn-shadow)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-1 px-1" style={{ color: 'var(--tg-theme-text-color)' }}>
        Налаштування
      </h1>
      <p className="text-sm mb-6 px-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Тема, нагадування, запис і слоти
      </p>

      {/* ── ТЕМА ── */}
      <SectionTitle>Тема</SectionTitle>
      <Card>
        {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([name, theme], i, arr) => {
          const isSel = currentTheme === name;
          return (
            <Row key={name} border={i < arr.length - 1}>
              <div className="w-8 h-8 rounded-full shrink-0"
                style={{
                  background: theme.preview,
                  boxShadow: isSel ? `0 2px 8px ${theme.vars['--theme-glow-color']}` : 'none',
                }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
                  {theme.label}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  {theme.description}
                </p>
              </div>
              <button onClick={() => handleThemeSelect(name)}
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={{
                  borderColor: isSel ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)55',
                  background: isSel ? 'var(--tg-theme-button-color)' : 'transparent',
                }}>
                {isSel && <Check size={11} color="white" strokeWidth={3} />}
              </button>
            </Row>
          );
        })}
      </Card>

      {/* ── БРЕНДИНГ (Pro/Year) ── */}
      <SectionTitle>Брендинг</SectionTitle>
      <Card>
        <div className="px-1 py-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>Колір бренду</p>
              <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Акцент на сторінці запису клієнта</p>
            </div>
            {!canBrand && (
              <Link to="/master/billing" className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
                <Lock size={11} /> Pro
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5" style={{ opacity: canBrand ? 1 : 0.45, pointerEvents: canBrand ? 'auto' : 'none' }}>
            <button onClick={() => setAccentColor('')}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ border: `1.5px solid ${!accentColor ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)55'}`, background: 'var(--tg-theme-bg-color)' }}
              title="За темою">
              {!accentColor && <Check size={12} style={{ color: 'var(--tg-theme-button-color)' }} strokeWidth={3} />}
            </button>
            {ACCENT_SWATCHES.map(c => (
              <button key={c} onClick={() => setAccentColor(c)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: c, boxShadow: accentColor === c ? `0 0 0 2px var(--tg-theme-bg-color), 0 0 0 4px ${c}` : 'none' }}>
                {accentColor === c && <Check size={12} color="#fff" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── НАГАДУВАННЯ ── */}
      <SectionTitle>Нагадування клієнтам</SectionTitle>
      <Card>
        {/* Reminder 1 */}
        <Row>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: rem1Enabled ? 'var(--tg-theme-button-color)22' : 'var(--tg-theme-hint-color)22' }}>
            {rem1Enabled
              ? <Bell size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
              : <BellOff size={16} style={{ color: 'var(--tg-theme-hint-color)' }} />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Перше нагадування
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {rem1Enabled ? `За ${rem1Hours} год до запису` : 'Вимкнено'}
            </p>
          </div>
          <Toggle value={rem1Enabled} onChange={setRem1Enabled} />
        </Row>
        {rem1Enabled && (
          <div className="px-4 pb-3 pt-1">
            <HourPicker value={rem1Hours} options={[6, 12, 24, 48, 72]} onChange={setRem1Hours} />
          </div>
        )}

        {/* Reminder 2 */}
        <Row border={false}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: rem2Enabled ? 'var(--tg-theme-button-color)22' : 'var(--tg-theme-hint-color)22' }}>
            {rem2Enabled
              ? <Bell size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
              : <BellOff size={16} style={{ color: 'var(--tg-theme-hint-color)' }} />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Друге нагадування
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {rem2Enabled ? `За ${rem2Hours} год до запису` : 'Вимкнено'}
            </p>
          </div>
          <Toggle value={rem2Enabled} onChange={setRem2Enabled} />
        </Row>
        {rem2Enabled && (
          <div className="px-4 pb-3 pt-1">
            <HourPicker value={rem2Hours} options={[1, 2, 3, 4, 6]} onChange={setRem2Hours} />
          </div>
        )}
      </Card>

      {/* ── ЗАПИС ── */}
      <SectionTitle>Запис клієнтів</SectionTitle>
      <Card>
        <Row>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-button-color)22' }}>
            <Zap size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Авто-підтвердження
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {autoConfirm ? 'Запис підтверджується одразу' : 'Ви підтверджуєте вручну'}
            </p>
          </div>
          <Toggle value={autoConfirm} onChange={setAutoConfirm} />
        </Row>

        <Row border={false}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-hint-color)22' }}>
            <Ban size={16} style={{ color: 'var(--tg-theme-hint-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Ліміт скасування
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {cancellationHours === 0 ? 'Завжди дозволено' : `Лише за ${cancellationHours}+ год`}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[0, 2, 4, 12, 24].map(h => (
              <button key={h}
                onClick={() => setCancellationHours(h)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: cancellationHours === h ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-bg-color)',
                  color: cancellationHours === h ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-hint-color)',
                  border: `1.5px solid ${cancellationHours === h ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)33'}`,
                }}>
                {h === 0 ? '∞' : `${h}г`}
              </button>
            ))}
          </div>
        </Row>

        <Row>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-hint-color)22' }}>
            <Calendar size={16} style={{ color: 'var(--tg-theme-hint-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Записів на день
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {`Один клієнт: до ${maxPerDay} на день`}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 5].map(n => (
              <button key={n}
                onClick={() => setMaxPerDay(n)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: maxPerDay === n ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-bg-color)',
                  color: maxPerDay === n ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-hint-color)',
                  border: `1.5px solid ${maxPerDay === n ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)33'}`,
                }}>
                {n}
              </button>
            ))}
          </div>
        </Row>
      </Card>

      {/* ── СЛОТИ ── */}
      <SectionTitle>Слоти за замовчуванням</SectionTitle>
      <Card>
        <Row>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-button-color)22' }}>
            <Calendar size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Робочий день
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {workStart} – {workEnd}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <TimePicker value={workStart} onChange={setWorkStart} />
            <span style={{ color: 'var(--tg-theme-hint-color)' }}>–</span>
            <TimePicker value={workEnd} onChange={setWorkEnd} />
          </div>
        </Row>

        <Row>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-button-color)22' }}>
            <Clock size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Тривалість слоту
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {slotDuration} хв
            </p>
          </div>
          <div className="flex gap-1.5">
            {[30, 45, 60, 90, 120].map(m => (
              <button key={m}
                onClick={() => setSlotDuration(m)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: slotDuration === m ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-bg-color)',
                  color: slotDuration === m ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-hint-color)',
                  border: `1.5px solid ${slotDuration === m ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)33'}`,
                }}>
                {m}
              </button>
            ))}
          </div>
        </Row>

        <Row border={false}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--tg-theme-hint-color)22' }}>
            <Clock size={16} style={{ color: 'var(--tg-theme-hint-color)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>
              Перерва між слотами
            </p>
            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {breakMinutes === 0 ? 'Без перерви' : `${breakMinutes} хв`}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[0, 10, 15, 20, 30].map(m => (
              <button key={m}
                onClick={() => setBreakMinutes(m)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: breakMinutes === m ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-bg-color)',
                  color: breakMinutes === m ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-hint-color)',
                  border: `1.5px solid ${breakMinutes === m ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)33'}`,
                }}>
                {m === 0 ? 'Нема' : m}
              </button>
            ))}
          </div>
        </Row>
      </Card>

      {saved && !dirty && (
        <p className="text-center text-sm mt-6" style={{ color: 'var(--tg-theme-button-color)' }}>
          Збережено
        </p>
      )}
    </div>
  );
}
