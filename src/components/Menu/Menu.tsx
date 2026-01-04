import { useContext } from 'react';
import { AppContext, AppName } from '../../contexts/AppContext';
import './menu.css';

import { useEffect, useState } from 'react';

interface Conversation {
  id: string;
  title: string;
  created_at: number;
}


const apps: { id: AppName; name: string; icon: string }[] = [
  { id: 'chat', name: 'Chat', icon: '💬' },
  { id: 'website-chat', name: 'Website Chat', icon: '📝' },
  { id: 'file-chat', name: 'File Chat', icon: '📁' },
  { id: 'workflows', name: 'Workflows', icon: '⚡' },
];

const Menu = () => {
  const ctx = useContext(AppContext);
  if (!ctx) return null;

  const { setCurrentThreadId, setActiveApp, activeApp } = ctx;
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await window.llocalAiApi.getHistory();
      setConversations(history);
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const startNewConversation = () => {
    setCurrentThreadId(null); // new thread
    setActiveApp('chat');
  };

  return (
    <div className="menu">
      <button className="new-convo-btn" onClick={startNewConversation}>
        + New Conversation
      </button>

      <div className="recent-convos">
        <h4>Recent</h4>
        <ul>
          {conversations.map((c) => (
            <li key={c.id} onClick={() => {
              setCurrentThreadId(c.id);
              setActiveApp('chat');
            }}>
              {c.title}
            </li>
          ))}
        </ul>
      </div>

      <div className="divider" />

      <div className="apps">
        {apps.map((app) => (
          <div
            key={app.id}
            className={`app-link ${activeApp === app.id ? 'active' : ''}`}
            onClick={() => setActiveApp(app.id)}
          >
            <span className="icon">{app.icon}</span>
            <span>{app.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Menu;
