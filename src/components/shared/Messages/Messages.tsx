import "./Messages.css";
import { useState } from "react";

const Messages = ({ messages }: any) => {
    const renderPastSteps = (pastSteps: any[]) => (
        <div className="past-steps">
            <h5>Past Steps:</h5>
            <ol>
                {pastSteps.map(([action, result], idx) => (
                    <li key={idx}>
                        <div><strong>Action:</strong> {action}</div>
                        <div><strong>Result:</strong> {result}</div>
                    </li>
                ))}
            </ol>
        </div>
    );

    const renderMessage = (message: any) => {
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

    return (
        <div className="messages-container">
            {(!messages || messages.length === 0) ? (
                <div className="empty-state">
                    <h1>Start a chat!</h1>
                </div>
            ) : (
                messages.map((message: any, index: number) => (
                    <div key={index} className="message">
                        {renderMessage(message)}
                    </div>
                ))
            )}
        </div>
    );
}

export default Messages;