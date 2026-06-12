import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, Scissors, BarChart2, Clock, Settings } from 'lucide-react';
import { useUI } from '../context/UIContext';

const tabs = [
  { to: '/master/home',      icon: Home,      label: 'Головна' },
  { to: '/master/schedule',  icon: Calendar,  label: 'Розклад' },
  { to: '/master/slots',     icon: Clock,     label: 'Слоти' },
  { to: '/master/clients',   icon: Users,     label: 'Клієнти' },
  { to: '/master/services',  icon: Scissors,  label: 'Послуги' },
  { to: '/master/analytics', icon: BarChart2, label: 'Аналітика' },
  { to: '/master/settings',  icon: Settings,  label: 'Тема' },
];

export default function MasterLayout() {
  const { navVisible } = useUI();
  const location = useLocation();

  return (
    <div className="flex flex-col h-screen relative overflow-hidden"
      style={{ background: 'var(--tg-theme-bg-color)' }}>

      {/* Glow фон */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', width: 280, height: 280, borderRadius: '50%',
          background: 'var(--theme-glow-color)', filter: 'blur(80px)',
          top: -80, right: -60,
        }} />
        <div style={{
          position: 'absolute', width: 180, height: 180, borderRadius: '50%',
          background: 'var(--theme-glow-color)', filter: 'blur(60px)',
          bottom: 80, left: -40, opacity: 0.5,
        }} />
      </div>

      {/* Контент */}
      <main className="flex-1 overflow-y-auto pb-20 relative" style={{ zIndex: 1 }}>
        <div key={location.pathname} className="bb-page">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation — ховається коли відкрита форма */}
      {navVisible && (
        <nav className="fixed bottom-0 left-0 right-0 flex" style={{ zIndex: 10 }}>
          <div className="absolute inset-0" style={{
            background: 'var(--tg-theme-bg-color)',
            opacity: 0.93,
            borderTop: '0.5px solid var(--theme-glow-color)',
            boxShadow: '0 -4px 24px var(--theme-glow-color)',
          }} />

          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center justify-center flex-1 py-2.5 gap-0.5 relative"
              style={({ isActive }) => ({
                color: isActive ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                      style={{ background: 'var(--tg-theme-button-color)' }} />
                  )}
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="text-[10px]" style={{ fontWeight: isActive ? 600 : 400 }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
