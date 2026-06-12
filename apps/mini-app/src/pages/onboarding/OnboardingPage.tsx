import { useState } from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { THEMES, ThemeName, applyTheme } from '../../themes';
import api from '../../api/client';
import { useTelegram } from '../../hooks/useTelegram';
import { Illustration } from '../../components/Illustration';

type Step = 'welcome' | 'specialty' | 'profile' | 'theme' | 'bot' | 'done';

interface OnboardingData {
  specialties: string[];
  fullName: string;
  phone: string;
  city: string;
  bio: string;
  theme: ThemeName;
  botToken: string;
}

const SPECIALTIES = [
  { value: 'manicure',    label: 'Манікюр' },
  { value: 'pedicure',    label: 'Педикюр' },
  { value: 'eyelashes',   label: 'Вії' },
  { value: 'makeup',      label: 'Макіяж' },
  { value: 'hairdresser', label: 'Перукар' },
  { value: 'tattoo',      label: 'Тату' },
  { value: 'eyebrows',    label: 'Брови' },
  { value: 'massage',     label: 'Масаж' },
  { value: 'cosmetology', label: 'Косметологія' },
  { value: 'other',       label: 'Інше' },
];

const STEPS: Step[] = ['welcome', 'specialty', 'profile', 'theme', 'bot', 'done'];
const PROGRESS_STEPS = STEPS.filter(s => s !== 'welcome' && s !== 'done');

export default function OnboardingPage() {
  const { user } = useTelegram();
  const [step, setStep] = useState<Step>('welcome');
  const [data, setData] = useState<OnboardingData>({
    specialties: [],
    fullName: user ? `${user.first_name} ${user.last_name ?? ''}`.trim() : '',
    phone: '', city: '', bio: '', theme: 'dusty_rose', botToken: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [masterBotUsername, setMasterBotUsername] = useState('');

  const stepIndex = STEPS.indexOf(step);
  const progressIndex = (PROGRESS_STEPS as Step[]).indexOf(step);

  function next() { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]); }
  function back() { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); }

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await api.post('/masters/register', {
        telegramId: String(user?.id ?? '0'),
        username: user?.username,
        fullName: data.fullName, phone: data.phone,
        city: data.city, bio: data.bio,
        specialties: data.specialties,
        botToken: data.botToken, theme: data.theme,
      });
      setMasterBotUsername(res.data.botUsername ?? '');
      applyTheme(data.theme);
      setStep('done');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Перевірте токен бота');
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden"
      style={{ background: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-text-color)' }}>

      {/* Glow фон */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'var(--theme-glow-color)', filter: 'blur(80px)',
          top: -80, right: -60,
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'var(--theme-glow-color)', filter: 'blur(60px)',
          bottom: 60, left: -40, opacity: 0.6,
        }} />
      </div>

      {/* Прогрес */}
      {step !== 'welcome' && step !== 'done' && (
        <div className="px-5 pt-5 pb-2 relative" style={{ zIndex: 1 }}>
          <div className="flex gap-1 mb-4">
            {PROGRESS_STEPS.map((s, i) => (
              <div key={s} className="h-0.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= progressIndex ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-secondary-bg-color)' }} />
            ))}
          </div>
          <button onClick={back} className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--tg-theme-hint-color)' }}>
            <ChevronLeft size={15} /> Назад
          </button>
        </div>
      )}

      <div className="relative flex flex-col flex-1" style={{ zIndex: 1 }}>
        {step === 'welcome'   && <WelcomeStep onNext={next} />}
        {step === 'specialty' && <SpecialtyStep selected={data.specialties} onChange={s => setData(d => ({ ...d, specialties: s }))} onNext={next} />}
        {step === 'profile'   && <ProfileStep data={data} onChange={u => setData(d => ({ ...d, ...u }))} onNext={next} />}
        {step === 'theme'     && <ThemeStep selected={data.theme} onChange={t => { setData(d => ({ ...d, theme: t })); applyTheme(t); }} onNext={next} />}
        {step === 'bot'       && <BotStep token={data.botToken} onChange={t => setData(d => ({ ...d, botToken: t }))} onSubmit={submit} loading={loading} error={error} />}
        {step === 'done'      && <DoneStep username={masterBotUsername} />}
      </div>
    </div>
  );
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col flex-1 px-5 pt-14 pb-8">
      <div className="mb-12">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-6 px-3 py-1.5 rounded-full"
          style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
          Для б'юті-майстрів
        </span>
        <h1 className="text-5xl font-bold leading-none tracking-tight mb-4"
          style={{ color: 'var(--tg-theme-text-color)' }}>
          Твій бот.<br />
          <span style={{ color: 'var(--tg-theme-button-color)' }}>Твої</span> клієнти.
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--tg-theme-hint-color)' }}>
          Власний Telegram-бот для запису — без сайтів, без зайвих кроків.
        </p>
      </div>

      <div className="flex-1 space-y-6 mb-12">
        {[
          { n: '01', title: 'Власний бот', desc: 'Клієнти записуються прямо в Telegram' },
          { n: '02', title: 'Розклад',     desc: 'Управляй слотами і записами в реальному часі' },
          { n: '03', title: 'Нагадування', desc: 'Автоматичні нагадування клієнтам про візит' },
          { n: '04', title: 'Аналітика',   desc: 'Статистика клієнтів і доходів' },
        ].map(({ n, title, desc }) => (
          <div key={n} className="flex items-start gap-4">
            <span className="text-xs font-bold mt-0.5 w-6 shrink-0 tabular-nums"
              style={{ color: 'var(--tg-theme-button-color)' }}>{n}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{title}</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Btn onClick={onNext}>Почати реєстрацію</Btn>
    </div>
  );
}

// ─── Specialty ────────────────────────────────────────────────────────────────

function SpecialtyStep({ selected, onChange, onNext }: {
  selected: string[]; onChange: (s: string[]) => void; onNext: () => void;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(s => s !== value) : [...selected, value]);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }

  return (
    <div className="flex flex-col flex-1 px-5 pt-3 pb-8">
      <h2 className="text-3xl font-bold mb-1" style={{ color: 'var(--tg-theme-text-color)' }}>
        Спеціалізація
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Обери одну або декілька
      </p>

      <div className="flex flex-wrap gap-2.5 flex-1 content-start">
        {SPECIALTIES.map(({ value, label }) => {
          const isSelected = selected.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggle(value)}
              className="px-5 py-2.5 rounded-full text-sm font-medium transition-all"
              style={isSelected ? {
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                boxShadow: 'var(--theme-btn-shadow)',
                transform: 'scale(1.03)',
              } : {
                background: 'var(--theme-pill-bg)',
                color: 'var(--tg-theme-text-color)',
              }}
            >
              {isSelected && <Check size={12} className="inline mr-1.5 mb-0.5" strokeWidth={3} />}
              {label}
            </button>
          );
        })}
      </div>

      <Btn onClick={onNext} disabled={!selected.length} className="mt-8">
        {selected.length ? `Далі — ${selected.length} обрано` : 'Оберіть спеціалізацію'}
      </Btn>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileStep({ data, onChange, onNext }: {
  data: OnboardingData; onChange: (u: Partial<OnboardingData>) => void; onNext: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 px-5 pt-3 pb-8">
      <h2 className="text-3xl font-bold mb-1" style={{ color: 'var(--tg-theme-text-color)' }}>
        Ваш профіль
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Клієнти побачать цю інформацію
      </p>

      <div className="space-y-5 flex-1">
        <Field label="Ім'я та прізвище" required>
          <input value={data.fullName} onChange={e => onChange({ fullName: e.target.value })}
            placeholder="Марина Козак" className="onb-input" />
        </Field>
        <Field label="Телефон">
          <input value={data.phone} onChange={e => onChange({ phone: e.target.value })}
            placeholder="+380 99 123 45 67" type="tel" className="onb-input" />
        </Field>
        <Field label="Місто">
          <input value={data.city} onChange={e => onChange({ city: e.target.value })}
            placeholder="Київ" className="onb-input" />
        </Field>
        <Field label="Про себе">
          <textarea value={data.bio} onChange={e => onChange({ bio: e.target.value })}
            placeholder="Досвід, стиль, що вас відрізняє..."
            rows={3} className="onb-input resize-none" />
        </Field>
      </div>

      <Btn onClick={onNext} disabled={!data.fullName.trim()} className="mt-8">Далі</Btn>
    </div>
  );
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function ThemeStep({ selected, onChange, onNext }: {
  selected: ThemeName; onChange: (t: ThemeName) => void; onNext: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 px-5 pt-3 pb-8">
      <h2 className="text-3xl font-bold mb-1" style={{ color: 'var(--tg-theme-text-color)' }}>
        Тема
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Стиль твого кабінету
      </p>

      <div className="space-y-2.5 flex-1">
        {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([name, theme]) => {
          const isSelected = selected === name;
          return (
            <button key={name} onClick={() => onChange(name)}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all"
              style={{
                background: isSelected ? 'var(--tg-theme-secondary-bg-color)' : 'transparent',
                border: `1.5px solid ${isSelected ? 'var(--tg-theme-button-color)' : 'transparent'}`,
                boxShadow: isSelected ? 'var(--theme-shadow)' : 'none',
              }}>
              <div className="w-9 h-9 rounded-full shrink-0"
                style={{ background: theme.preview, boxShadow: `0 3px 10px ${theme.vars['--theme-glow-color']}` }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--tg-theme-text-color)' }}>{theme.label}</p>
                <p className="text-xs truncate" style={{ color: 'var(--tg-theme-hint-color)' }}>{theme.description}</p>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--tg-theme-button-color)' }}>
                  <Check size={11} color="white" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Btn onClick={onNext} className="mt-8">Далі</Btn>
    </div>
  );
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

function BotStep({ token, onChange, onSubmit, loading, error }: {
  token: string; onChange: (t: string) => void;
  onSubmit: () => void; loading: boolean; error: string;
}) {
  return (
    <div className="flex flex-col flex-1 px-5 pt-3 pb-8">
      <h2 className="text-3xl font-bold mb-1" style={{ color: 'var(--tg-theme-text-color)' }}>
        Telegram бот
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Клієнти записуватимуться через цього бота
      </p>

      <div className="rounded-2xl p-4 mb-6 space-y-3.5"
        style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
        {[
          ['1', 'Відкрий @BotFather в Telegram'],
          ['2', 'Напиши /newbot і дай назву'],
          ['3', 'Скопіюй токен і встав нижче'],
        ].map(([n, text]) => (
          <div key={n} className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }}>
              {n}
            </span>
            <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>{text}</span>
          </div>
        ))}
      </div>

      <Field label="Токен бота">
        <input value={token} onChange={e => onChange(e.target.value)}
          placeholder="123456789:ABCdef..."
          className="onb-input font-mono text-xs" />
      </Field>

      {error && (
        <p className="text-sm mt-4 px-1" style={{ color: '#e05c5c' }}>{error}</p>
      )}

      <Btn onClick={onSubmit} disabled={!token.trim() || loading} className="mt-8">
        {loading ? 'Реєструємо...' : 'Зареєструватись'}
      </Btn>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ username }: { username: string }) {
  return (
    <div className="flex flex-col flex-1 px-5 pt-16 pb-8">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
        style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
        <Illustration name="sparkle" size={36} />
      </div>

      <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--tg-theme-text-color)' }}>
        Готово.
      </h1>
      <p className="text-base mb-8" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Бот активний і готовий приймати клієнтів.
      </p>

      {username && (
        <div className="rounded-2xl p-4 mb-8"
          style={{ background: 'var(--tg-theme-secondary-bg-color)', boxShadow: 'var(--theme-shadow)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Посилання для клієнтів
          </p>
          <p className="font-bold text-lg" style={{ color: 'var(--tg-theme-button-color)' }}>
            t.me/{username}
          </p>
        </div>
      )}

      <div className="space-y-3.5 flex-1">
        {[
          'Додайте послуги у вкладці Послуги',
          'Налаштуйте вільні слоти',
          'Поділіться посиланням з клієнтами',
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: 'var(--tg-theme-button-color)' }} />
            <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>{s}</span>
          </div>
        ))}
      </div>

      <Btn onClick={() => window.location.href = '/billing'} className="mt-8">
        Далі
      </Btn>
    </div>
  );
}

// ─── Утиліти ──────────────────────────────────────────────────────────────────

function Btn({ onClick, disabled, children, className = '' }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${className}`}
      style={{
        background: 'var(--tg-theme-button-color)',
        color: 'var(--tg-theme-button-text-color)',
        boxShadow: disabled ? 'none' : 'var(--theme-btn-shadow)',
        opacity: disabled ? 0.35 : 1,
      }}>
      {children}
    </button>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-2 tracking-widest uppercase"
        style={{ color: 'var(--tg-theme-hint-color)' }}>
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}
