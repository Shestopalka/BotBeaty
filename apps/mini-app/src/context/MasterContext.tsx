import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api from '../api/client';
import { applyTheme, ThemeName, THEMES } from '../themes';

export interface Master {
  id: string;
  fullName: string;
  botUsername?: string;
  specialties: string[];
  theme: string;
  status: string;

  // Notifications
  reminder1Enabled: boolean;
  reminder1Hours: number;
  reminder2Enabled: boolean;
  reminder2Hours: number;

  // Booking
  autoConfirm: boolean;
  cancellationHours: number;
  maxBookingsPerDayPerClient: number;

  // Subscription
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  plan?: string;
  accentColor?: string | null;

  // Slot defaults
  defaultWorkStart: string;
  defaultWorkEnd: string;
  defaultSlotDuration: number;
  defaultBreakMinutes: number;
}

// Перевіряємо чи тема існує у нашому словнику
function isValidTheme(name: string): name is ThemeName {
  return name in THEMES;
}

interface MasterContextValue {
  master: Master | null;
  loading: boolean;
  isRegistered: boolean;
  networkError: boolean; // true = мережева помилка, false = 404/401
  refresh: () => Promise<void>;
}

const MasterContext = createContext<MasterContextValue>({
  master: null,
  loading: true,
  isRegistered: false,
  networkError: false,
  refresh: async () => {},
});

export function MasterProvider({ children }: { children: ReactNode }) {
  const [master, setMaster] = useState<Master | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);

  async function fetchMaster() {
    setLoading(true);
    try {
      const { data } = await api.get('/masters/me');
      setMaster(data);
      setNetworkError(false);
      // Застосовуємо тему лише якщо вона валідна (є у нашому словнику)
      if (data.theme && isValidTheme(data.theme)) {
        applyTheme(data.theme);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      console.error('[MasterContext] fetchMaster error:', status, err?.message);
      if (status === 401 || status === 403 || status === 404) {
        // Не зареєстрований або не авторизований → онбординг
        setMaster(null);
        setNetworkError(false);
      } else {
        // Мережева помилка або 5xx — НЕ редіректимо на онбординг
        setNetworkError(true);
        // master залишається попереднім значенням (null при першому завантаженні)
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchMaster(); }, []);

  return (
    <MasterContext.Provider value={{
      master,
      loading,
      isRegistered: !!master,
      networkError,
      refresh: fetchMaster,
    }}>
      {children}
    </MasterContext.Provider>
  );
}

export const useMaster = () => useContext(MasterContext);
