import { useState } from 'react';
import { Check, Bell, BellOff, Calendar, Clock, Zap, Ban } from 'lucide-react';
import { THEMES, ThemeName, applyTheme, getSavedTheme } from '../../themes';
import { mastersApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';

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
  const { master } = useMaster();
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

  // ── Slot defaults ──
  const [workStart,    setWorkStart]    = useState(master?.defaultWorkStart ?? '09:00');
  const [workEnd,      setWorkEnd]      = useState(master?.defaultWorkEnd ?? '18:00');
  const [slotDuration, setSlotDuration] = useState(master?.defaultSlotDuration ?? 60);
  const [breakMinutes, setBreakMinutes] = useState(master?.defaultBreakMinutes ?? 15);

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

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
        defaultWorkStart:    workStart,
        defaultWorkEnd:      workEnd,
        defaultSlotDuration: slotDuration,
        defaultBreakMinutes: breakMinutes,
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col px-4 pt-6 pb-32">
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

      {/* ── SAVE ── */}
      <button
        onClick={saveAll}
        disabled={saving}
        className="w-full mt-8 py-4 rounded-2xl font-semibold text-base transition-all"
        style={{
          background: 'var(--tg-theme-button-color)',
          color: 'var(--tg-theme-button-text-color)',
          boxShadow: saving ? 'none' : 'var(--theme-btn-shadow)',
          opacity: saving ? 0.7 : 1,
        }}>
        {saving ? 'Зберігаємо...' : saved ? '✓ Збережено' : 'Зберегти налаштування'}
      </button>
    </div>
  );
}
