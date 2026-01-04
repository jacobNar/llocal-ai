import "./Messages.css";
import { useState } from "react";

const MessageItem = ({ message }: { message: any }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const role = message.role || 'unknown';
    const content = message.content || '';

    let label = 'Unknown';
    if (role === 'user') label = 'User';
    else if (role === 'assistant') label = 'AI';
    else if (role === 'system') label = 'System';
    else if (role === 'tool') label = 'Tool';

    return (
        <div className={`message-block ${role}`}>
            <div className="message-header">
                <strong>{label}:</strong>
                {role === 'tool' && (
                    <button
                        className="collapse-btn"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{ marginLeft: '10px', cursor: 'pointer', background: 'none', border: 'none', color: '#007bff' }}
                    >
                        {isCollapsed ? '[Expand]' : '[Collapse]'}
                    </button>
                )}
            </div>
            {role === 'tool' ? (
                !isCollapsed && <div className="message-content">{content}</div>
            ) : (
                <div className="message-content">{content}</div>
            )}
        </div>
    );
};

const Messages = ({ messages }: any) => {
    return (
        <div className="messages-container">
            {(!messages || messages.length === 0) ? (
                <div className="empty-state">
                    <h1>Start a chat!</h1>
                </div>
            ) : (
                messages.map((message: any, index: number) => (
                    <div key={index} className="message">
                        <MessageItem message={message} />
                    </div>
                ))
            )}
        </div>
    );
};

export default Messages;