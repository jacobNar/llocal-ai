import { createRoot } from 'react-dom/client';
import { AppProvider } from "./contexts/AppContext"
import Menu from './components/Menu/Menu';
import Dashboard from './components/Dashboard/Dashboard';

// export { };

export interface IElectronAPI {
    runQuery: (message: string, conversationId?: string) => Promise<any>;
    webCrawlerTool: (url: string) => Promise<any>;
    getHistory: () => Promise<any[]>;
    loadConversation: (id: string) => Promise<any[]>;
}

declare global {
    interface Window {
        llocalAiApi: IElectronAPI;
    }
}

const root = createRoot(document.body);
root.render(
    <AppProvider>
        <div className="dashboard">
            <div>
                <Menu />
            </div>
            <div>
                <Dashboard />
            </div>
        </div>
    </AppProvider>
);