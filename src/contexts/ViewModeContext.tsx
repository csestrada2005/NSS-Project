import { createContext, useContext, useState, type ReactNode } from 'react';

type ViewMode = 'admin' | 'dev';

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  viewMode: 'admin',
  setViewMode: () => {},
});

export const ViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('nebu_view_mode');
    return (stored === 'admin' || stored === 'dev') ? stored : 'admin';
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem('nebu_view_mode', mode);
  };

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => useContext(ViewModeContext);
