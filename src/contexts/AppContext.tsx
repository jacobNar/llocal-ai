import React, { createContext, useState, ReactNode } from 'react';

export type AppName = 'chat' | 'file-chat' | 'website-chat';

interface AppContextType {
  activeApp: AppName;
  setActiveApp: (app: AppName) => void;
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;
}

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [activeApp, setActiveApp] = useState<AppName>('chat');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        activeApp,
        setActiveApp,
        currentThreadId,
        setCurrentThreadId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
