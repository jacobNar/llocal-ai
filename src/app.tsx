import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
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

const MainLayout = () => {
    // 800px is a reasonable breakpoint for "half screen" or tablet size
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 800);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 800) {
                setIsSidebarOpen(false);
            } else {
                setIsSidebarOpen(true);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    return (
        <div className={`dashboard ${isSidebarOpen ? '' : 'sidebar-closed'}`}>
            <div className="sidebar-container">
                <Menu />
                <button className="sidebar-toggle-btn inner" onClick={toggleSidebar}>
                    {/* Chevron Left or similar */}
                    &laquo;
                </button>
            </div>
            <div className="main-content">
                {!isSidebarOpen && (
                    <button className="sidebar-toggle-btn floating" onClick={toggleSidebar}>
                        &#9776; {/* Hamburger icon */}
                    </button>
                )}
                <Dashboard />
            </div>
        </div>
    );
};

const root = createRoot(document.body);
root.render(
    <AppProvider>
        <MainLayout />
    </AppProvider>
);