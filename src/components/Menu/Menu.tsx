import { useContext } from 'react';
import { AppContext, AppName } from '../../contexts/AppContext';
import './menu.css';

const recentConversations = [
  { id: '1', title: 'How to cook pasta' },
  { id: '2', title: 'React context help' },
  { id: '3', title: 'Vacation plan' },
];

const apps: { id: AppName; name: string; icon: string }[] = [
  { id: 'chat', name: 'Chat', icon: '💬' },
  { id: 'website-chat', name: 'Website Chat', icon: '📝' },
  { id: 'file-chat', name: 'File Chat', icon: '📁' },
];

const Menu = () => {
  const ctx = useContext(AppContext);
  if (!ctx) return null;

  const { setCurrentThreadId, setActiveApp, activeApp } = ctx;

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
          {recentConversations.map((c) => (
            <li key={c.id} onClick={() => setCurrentThreadId(c.id)}>
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
