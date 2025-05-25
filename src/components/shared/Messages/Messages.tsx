import "./Messages.css";

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

    const renderMessage = (message: any) => (
        <div className="message-block">
            <div className="user-input">
                <strong>User Input:</strong> {message.input}
            </div>
            {message.plan && message.plan.length > 0 && (
                <div className="plan">
                    <strong>Plan:</strong>
                    <ul>
                        {message.plan.map((step: any, idx: number) => (
                            <li key={idx}>{step}</li>
                        ))}
                    </ul>
                </div>
            )}
            {message.pastSteps && message.pastSteps.length > 0 && renderPastSteps(message.pastSteps)}
            {message.response && (
                <div className="response">
                    <strong>Response:</strong> {message.response}
                </div>
            )}
        </div>
    );

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