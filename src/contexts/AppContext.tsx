import React, { createContext, useState, ReactNode } from 'react';

export type AppName = 'chat' | 'file-chat' | 'website-chat' | 'workflows';

interface AppContextType {
  activeApp: AppName;
  setActiveApp: (app: AppName) => void;
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [activeApp, setActiveApp] = useState<AppName>('chat');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);

  return (
    <AppContext.Provider
      value={{
        activeApp,
        setActiveApp,
        currentThreadId,
        setCurrentThreadId,
        refreshTrigger,
        triggerRefresh
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
