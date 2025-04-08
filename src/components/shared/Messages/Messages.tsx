import "./Messages.css";
const Messages = ({ messages }: any) => {

    const getMessageType = (message: any) => {
        if (message.tool_calls?.length > 0) return 'tool-request';
        if (message.lc_direct_tool_output) return 'tool-response';
        if (message.content) return 'message';
        return 'unknown';
    };

    const renderMessage = (message: any) => {
        const type = getMessageType(message);

        switch (type) {
            case 'tool-request':
                return (
                    <div className="tool-request">
                        <h4>Tool Request:</h4>
                        {message.tool_calls.map((tool: any, idx: number) => (
                            <div key={idx} className="tool-call">
                                <p><strong>Tool:</strong> {tool.name}</p>
                                <p><strong>Arguments:</strong></p>
                                <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                            </div>
                        ))}
                    </div>
                );
            case 'tool-response':
                return (
                    <div className="tool-response">
                        <h4>Tool Response:</h4>
                        <p><strong>Tool:</strong> {message.name}</p>
                        {message.content && <p>{message.content}</p>}
                    </div>
                );
            case 'message':
                return (
                    <div className="content-message">
                        {message.content}
                    </div>
                );
            default:
                return <div className="unknown-message">Unknown message type</div>;
        }
    };

    return (
        <div className="messages-container">
            {messages?.length === 0 ? (
                <div className="empty-state">
                    <h1>Start a chat!</h1>
                </div>
            ) : (
                messages.map((message: any, index: number) => (
                    <div key={index} className={`message ${getMessageType(message)}`}>
                        {renderMessage(message)}
                    </div>
                ))
            )}
        </div>
    );
}

export default Messages;
