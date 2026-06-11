import { useState, useEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext';
import { Search, MoreVertical, Users, FileText } from 'lucide-react';
import { clientsApi } from '../../api/client';
import { useMaster } from '../../context/MasterContext';

interface Client {
  id: string;
  fullName: string;
  username?: string;
  phone?: string;
  tag: 'new' | 'regular' | 'trusted' | 'blocked' | 'unwanted';
  notes?: string;
  createdAt: string;
}

const TAGS = [
  { value: '', label: 'Всі' },
  { value: 'new', label: 'Нові' },
  { value: 'regular', label: 'Постійні' },
  { value: 'trusted', label: 'Перевірені' },
  { value: 'blocked', label: 'Заблоковані' },
];

const TAG_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  new:      { label: 'Новий',        bg: 'rgba(55,138,221,0.12)',  color: '#185fa5' },
  regular:  { label: 'Постійний',    bg: 'rgba(239,159,39,0.12)',  color: '#c07010' },
  trusted:  { label: 'Перевірений',  bg: 'var(--theme-pill-bg)',   color: 'var(--tg-theme-button-color)' },
  blocked:  { label: 'Заблокований', bg: 'rgba(224,92,92,0.12)',   color: '#c04040' },
  unwanted: { label: 'Небажаний',    bg: 'rgba(239,159,39,0.12)',  color: '#c07010' },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const { master } = useMaster();
  const masterId = master?.id ?? '';

  useEffect(() => { loadClients(); }, [activeTag, masterId]);

  async function loadClients() {
    if (!masterId) return;
    setLoading(true);
    try {
      const data = await clientsApi.getByMaster(masterId, activeTag || undefined);
      setClients(data);
    } catch { setClients([]); }
    finally { setLoading(false); }
  }

  async function changeTag(clientId: string, tag: string) {
    await clientsApi.updateTag(clientId, masterId, tag);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    setSelected(null);
    loadClients();
  }

  async function saveNotes(clientId: string, notes: string) {
    await clientsApi.updateNotes(clientId, masterId, notes);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    setSelected(null);
    loadClients();
  }

  const filtered = clients.filter(c =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--tg-theme-text-color)' }}>
          Клієнти
        </h1>

        {/* Пошук */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-3"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
          <Search size={15} style={{ color: 'var(--tg-theme-hint-color)' }} />
          <input type="text" placeholder="Пошук..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--tg-theme-text-color)' }} />
        </div>

        {/* Фільтр */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TAGS.map(t => (
            <button key={t.value} onClick={() => setActiveTag(t.value)}
              className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
              style={activeTag === t.value ? {
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                boxShadow: 'var(--theme-btn-shadow)',
              } : {
                background: 'var(--tg-theme-secondary-bg-color)',
                color: 'var(--tg-theme-hint-color)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--tg-theme-button-color)', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Users size={40} style={{ color: 'var(--tg-theme-hint-color)', opacity: 0.25 }} />
            <p style={{ color: 'var(--tg-theme-hint-color)' }}>Клієнтів не знайдено</p>
          </div>
        ) : (
          filtered.map(client => {
            const tagCfg = TAG_CONFIG[client.tag];
            return (
              <div key={client.id} className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{ background: 'var(--tg-theme-secondary-bg-color)', boxShadow: 'var(--theme-shadow)' }}>
                {/* Аватар */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0"
                  style={{
                    background: 'var(--theme-pill-bg)',
                    color: 'var(--tg-theme-button-color)',
                  }}>
                  {client.fullName[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate"
                      style={{ color: 'var(--tg-theme-text-color)' }}>
                      {client.fullName}
                    </span>
                    {tagCfg && (
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
                        style={{ background: tagCfg.bg, color: tagCfg.color }}>
                        {tagCfg.label}
                      </span>
                    )}
                  </div>
                  {client.username && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      @{client.username}
                    </p>
                  )}
                </div>

                <button onClick={() => setSelected(client)} className="p-2 rounded-xl"
                  style={{ color: 'var(--tg-theme-hint-color)' }}>
                  <MoreVertical size={17} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <ClientActionSheet
          client={selected}
          masterId={masterId}
          onClose={() => setSelected(null)}
          onTagChange={tag => changeTag(selected.id, tag)}
          onSaveNotes={notes => saveNotes(selected.id, notes)}
        />
      )}
    </div>
  );
}

function ClientActionSheet({ client, masterId, onClose, onTagChange, onSaveNotes }: {
  client: Client; masterId: string; onClose: () => void;
  onTagChange: (tag: string) => void; onSaveNotes: (notes: string) => void;
}) {
  const { hideNav, showNav } = useUI();
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState(client.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CLOSE_MS = 280;

  useEffect(() => {
    hideNav();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => showNav();
  }, []);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  function handleTagChange(tag: string) {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onTagChange(tag), CLOSE_MS);
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await onSaveNotes(notes);
    } finally {
      setSavingNotes(false);
    }
  }

  const actions = [
    { tag: 'regular', label: '⭐ Позначити постійним' },
    { tag: 'trusted', label: '◆ Позначити перевіреним' },
    { tag: 'new',     label: '✦ Повернути статус новий' },
    { tag: 'blocked', label: '✕ Заблокувати' },
  ].filter(a => a.tag !== client.tag);

  const tagCfg = TAG_CONFIG[client.tag];

  return (
    <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={handleClose}>
      <div className={`${closing ? 'bb-backdrop-out' : 'bb-backdrop'} absolute inset-0 bg-black/40`} />
      <div
        className={`${closing ? 'bb-sheet-out' : 'bb-sheet'} absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col`}
        style={{ background: 'var(--tg-theme-bg-color)', boxShadow: '0 -8px 32px var(--theme-glow-color)', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Ручка */}
        <div className="pt-3 pb-2 flex justify-center flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--tg-theme-secondary-bg-color)' }} />
        </div>

        <div ref={scrollRef} className="overflow-y-auto flex-1 px-5 pb-2 min-h-0">
          {/* Заголовок */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
              style={{ background: 'var(--theme-pill-bg)', color: 'var(--tg-theme-button-color)' }}>
              {client.fullName[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base truncate" style={{ color: 'var(--tg-theme-text-color)' }}>
                {client.fullName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {tagCfg && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: tagCfg.bg, color: tagCfg.color }}>
                    {tagCfg.label}
                  </span>
                )}
                {client.username && (
                  <span className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    @{client.username}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Нотатки */}
          <div className="mb-3">
            <button
              onClick={() => setShowNotes(v => !v)}
              className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl text-sm font-medium text-left"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}>
              <FileText size={16} style={{ color: 'var(--tg-theme-button-color)' }} />
              <span className="flex-1">
                {notes ? 'Редагувати нотатку' : 'Додати нотатку'}
              </span>
              {notes && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--tg-theme-button-color)22', color: 'var(--tg-theme-button-color)' }}>
                  є нотатка
                </span>
              )}
            </button>

            {showNotes && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Наприклад: алергія на гель, завжди запізнюється на 10 хв..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl text-sm resize-none outline-none"
                  style={{
                    background: 'var(--tg-theme-secondary-bg-color)',
                    color: 'var(--tg-theme-text-color)',
                    border: '1.5px solid var(--tg-theme-button-color)44',
                  }}
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="w-full py-3 rounded-2xl text-sm font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    background: 'var(--tg-theme-button-color)',
                    color: 'var(--tg-theme-button-text-color)',
                    boxShadow: 'var(--theme-btn-shadow)',
                  }}>
                  {savingNotes ? 'Зберігаємо...' : 'Зберегти нотатку'}
                </button>
              </div>
            )}
          </div>

          {/* Зміна статусу */}
          <div className="space-y-2">
            {actions.map(a => (
              <button key={a.tag} onClick={() => handleTagChange(a.tag)}
                className="w-full text-left py-3.5 px-4 rounded-2xl text-sm font-medium"
                style={{
                  background: 'var(--tg-theme-secondary-bg-color)',
                  color: a.tag === 'blocked' ? '#c04040' : 'var(--tg-theme-text-color)',
                }}>
                {a.label}
              </button>
            ))}
          </div>

          <button onClick={handleClose}
            className="w-full py-4 mt-2 rounded-2xl text-sm font-medium"
            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
            Скасувати
          </button>
        </div>

        <div style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom)', flexShrink: 0 }} />
      </div>
    </div>
  );
}
