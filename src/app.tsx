import { createRoot } from 'react-dom/client';
import { AppProvider } from "./contexts/AppContext"
import Menu from './components/Menu/Menu';
import Dashboard from './components/Dashboard/Dashboard';

// export { };

declare global {
    interface Window {
        llocalAiApi: {
            runQuery: (message: string) => Promise<any>;
            webCrawlerTool: (startUrl: string) => Promise<any>;
        };
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