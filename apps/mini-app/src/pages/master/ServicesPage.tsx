import { useState, useEffect, useCallback } from 'react';
import { useUI } from '../../context/UIContext';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import api from '../../api/client';
import { useMaster } from '../../context/MasterContext';
import { Illustration } from '../../components/Illustration';
import { formatPrice, PriceType } from '../../lib/price';

interface Service {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceType?: PriceType;
  price: number;
  priceMax?: number | null;
  currency: string;
  isActive: boolean;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [editService, setEditService] = useState<Partial<Service> | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { master } = useMaster();
  const masterId = master?.id ?? '';

  useEffect(() => { loadServices(); }, []);

  async function loadServices() {
    setLoading(true);
    try {
      const { data } = await api.get(`/masters/${masterId}`);
      setServices(data.services ?? []);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveService(form: Partial<Service>) {
    try {
      if (form.id) {
        await api.patch(`/services/${form.id}`, form);
      } else {
        await api.post('/services', { ...form, masterId });
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setShowForm(false);
      setEditService(null);
      loadServices();
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  }

  async function deleteService(id: string) {
    await api.delete(`/services/${id}`);
    loadServices();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
          Послуги
        </h1>
        <button
          onClick={() => { setEditService({}); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
            boxShadow: 'var(--theme-btn-shadow)',
          }}
        >
          <Plus size={15} /> Додати
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span style={{ color: 'var(--tg-theme-button-color)', opacity: 0.8 }}>
              <Illustration name="services" size={84} />
            </span>
            <p style={{ color: 'var(--tg-theme-hint-color)' }}>Додайте свої послуги</p>
          </div>
        ) : (
          services.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl p-4"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', boxShadow: 'var(--theme-shadow)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    {!s.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-hint-color)' }}>
                        Неактивна
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-sm mt-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      {s.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      <Clock size={14} /> {s.durationMinutes} хв
                    </span>
                    <span className="flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--tg-theme-button-color)' }}>
                      {formatPrice(s)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditService(s); setShowForm(true); }}
                    className="p-2 rounded-xl"
                    style={{ color: 'var(--tg-theme-hint-color)' }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => deleteService(s.id)}
                    className="p-2 rounded-xl text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Форма додавання/редагування */}
      {showForm && (
        <ServiceForm
          initial={editService ?? {}}
          onSave={saveService}
          onClose={() => { setShowForm(false); setEditService(null); }}
        />
      )}
    </div>
  );
}

function ServiceForm({
  initial,
  onSave,
  onClose,
}: {
  initial: Partial<Service>;
  onSave: (data: Partial<Service>) => void;
  onClose: () => void;
}) {
  const { hideNav, showNav } = useUI();

  // Ховаємо нижню навігацію поки форма відкрита, щоб MainButton був видимий
  useEffect(() => {
    hideNav();
    return () => showNav();
  }, []);

  const [closing, setClosing] = useState(false);
  const CLOSE_MS = 280;

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  function handleSave() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onSave({
      id: initial.id,
      name,
      description,
      durationMinutes: duration,
      priceType,
      price,
      priceMax: priceType === 'range' ? priceMax : null,
      currency: initial.currency ?? 'UAH',
      isActive: initial.isActive ?? true,
    }), CLOSE_MS);
  }

  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [durationStr, setDurationStr] = useState(String(initial.durationMinutes ?? 60));
  const [priceType, setPriceType] = useState<PriceType>(initial.priceType ?? 'fixed');
  const [priceStr, setPriceStr] = useState(String(initial.price ?? 0));
  const [priceMaxStr, setPriceMaxStr] = useState(
    initial.priceMax != null ? String(initial.priceMax) : '',
  );

  const duration = parseInt(durationStr) || 0;
  const price = parseFloat(priceStr) || 0;
  const priceMax = parseFloat(priceMaxStr) || 0;

  function handleNumericInput(value: string, setter: (v: string) => void, allowDecimal = false) {
    const clean = allowDecimal
      ? value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
      : value.replace(/\D/g, '');
    setter(clean);
  }

  const inputStyle = { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' };
  const rangeValid = priceType !== 'range' || priceMax > price;
  const canSave = name.trim().length > 0 && duration > 0 && rangeValid;



  return (
    <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/40`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col`}
        style={{ background: 'var(--tg-theme-bg-color)', boxShadow: '0 -8px 32px var(--theme-glow-color)', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex-shrink-0 px-5 pb-2">
          <h2 className="text-lg font-bold">{initial.id ? 'Редагувати послугу' : 'Нова послуга'}</h2>
        </div>

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          <div className="space-y-3">
            <Field label="Назва послуги">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Манікюр класичний"
                className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
            </Field>
            <Field label="Опис (необов'язково)">
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Короткий опис..."
                className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
            </Field>
            <Field label="Тривалість (хв)">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={durationStr}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleNumericInput(e.target.value, setDurationStr)}
                placeholder="60"
                className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
            </Field>

            {/* Тип ціни: фіксована або діапазон «від–до» */}
            <Field label="Ціна">
              <div className="flex gap-2 mb-2">
                {([['fixed', 'Фіксована'], ['range', 'Діапазон']] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPriceType(val)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={priceType === val
                      ? { background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }
                      : { background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              {priceType === 'fixed' ? (
                <input
                  type="text" inputMode="decimal"
                  value={priceStr}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => handleNumericInput(e.target.value, setPriceStr, true)}
                  placeholder="Ціна, ₴"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="decimal"
                    value={priceStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleNumericInput(e.target.value, setPriceStr, true)}
                    placeholder="від"
                    className="flex-1 px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
                  <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>–</span>
                  <input
                    type="text" inputMode="decimal"
                    value={priceMaxStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleNumericInput(e.target.value, setPriceMaxStr, true)}
                    placeholder="до"
                    className="flex-1 px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
                </div>
              )}
              {priceType === 'range' && !rangeValid && (
                <p className="text-xs mt-1" style={{ color: '#e05c5c' }}>
                  «До» має бути більшим за «від»
                </p>
              )}
            </Field>
          </div>
        </div>

        {/* Кнопка збереження */}
        <div className="flex-shrink-0 px-5 pt-2"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-4 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color, #fff)',
              boxShadow: 'var(--theme-btn-shadow)',
            }}
          >
            {initial.id ? 'Зберегти зміни' : 'Додати послугу'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs mb-1 block" style={{ color: 'var(--tg-theme-hint-color)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
