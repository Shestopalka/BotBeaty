import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MasterProvider, useMaster } from './context/MasterContext';
import { UIProvider } from './context/UIContext';
import MasterLayout from './components/MasterLayout';
import HomePage from './pages/master/HomePage';
import SchedulePage from './pages/master/SchedulePage';
import ClientsPage from './pages/master/ClientsPage';
import ServicesPage from './pages/master/ServicesPage';
import AnalyticsPage from './pages/master/AnalyticsPage';
import SlotsPage from './pages/master/SlotsPage';
import SettingsPage from './pages/master/SettingsPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import BookingPage from './pages/client/BookingPage';
import { Paywall } from './components/Paywall';
import { applyTheme, getSavedTheme } from './themes';

try {
  applyTheme(getSavedTheme());
} catch (e) {
  console.warn('[BeatyBOT] applyTheme failed:', e);
}

function MasterGuard({ children }: { children: React.ReactNode }) {
  const { loading, isRegistered, networkError, refresh, master } = useMaster();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--tg-theme-button-color)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // Мережева помилка — показуємо екран перезавантаження, не онбординг
  if (networkError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
        <span style={{ fontSize: 48 }}>📡</span>
        <p className="font-bold text-lg" style={{ color: 'var(--tg-theme-text-color)' }}>
          Немає з'єднання
        </p>
        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
          Перевірте інтернет і спробуйте знову
        </p>
        <button
          onClick={refresh}
          className="mt-2 px-6 py-3 rounded-2xl font-semibold"
          style={{ background: 'var(--tg-theme-button-color)', color: '#fff' }}
        >
          Повторити
        </button>
      </div>
    );
  }

  if (!isRegistered) {
    return <Navigate to="/onboarding" replace />;
  }

  // Підписка лапснула — показуємо paywall замість кабінету.
  const sub = master?.subscriptionStatus;
  if (sub === 'past_due' || sub === 'canceled') {
    return <Paywall status={sub} onRefresh={refresh} />;
  }

  return <>{children}</>;
}

function MasterApp() {
  return (
    <MasterProvider>
      <UIProvider>
        <Routes>
          <Route path="/master" element={
            <MasterGuard>
              <MasterLayout />
            </MasterGuard>
          }>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home"      element={<HomePage />} />
            <Route path="schedule"  element={<SchedulePage />} />
            <Route path="slots"     element={<SlotsPage />} />
            <Route path="clients"   element={<ClientsPage />} />
            <Route path="services"  element={<ServicesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings"  element={<SettingsPage />} />
          </Route>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<Navigate to="/master/home" replace />} />
        </Routes>
      </UIProvider>
    </MasterProvider>
  );
}

export default function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      (tg as any).setBackgroundColor?.('#fff8f9');
      tg.ready();
      tg.expand();
    }
    // Telegram SDK встановлює --tg-theme-* через style.setProperty після ініціалізації.
    // Перезастосовуємо нашу тему одразу після ready() щоб наш <style !important> переміг.
    try { applyTheme(getSavedTheme()); } catch (_) {}
    // Якщо Telegram стрільне themeChanged — знову накладаємо нашу палітру
    try {
      (tg as any)?.onEvent('themeChanged', () => {
        try { applyTheme(getSavedTheme()); } catch (_) {}
      });
    } catch (_) {}
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/book/:masterId" element={<BookingPage />} />
        <Route path="*" element={<MasterApp />} />
      </Routes>
    </BrowserRouter>
  );
}
