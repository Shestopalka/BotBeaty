import { createContext, useContext, useState, ReactNode } from 'react';

interface UIContextValue {
  navVisible: boolean;
  hideNav: () => void;
  showNav: () => void;
}

const UIContext = createContext<UIContextValue>({
  navVisible: true,
  hideNav: () => {},
  showNav: () => {},
});

export function UIProvider({ children }: { children: ReactNode }) {
  const [navVisible, setNavVisible] = useState(true);
  return (
    <UIContext.Provider value={{
      navVisible,
      hideNav: () => setNavVisible(false),
      showNav: () => setNavVisible(true),
    }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
