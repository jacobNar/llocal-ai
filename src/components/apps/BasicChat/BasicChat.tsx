import { useState } from 'react';
import Messages from '../../shared/Messages/Messages';
import QueryForm from '../../shared/QueryForm/QueryForm';

const BasicChat = () => {

    const [messages, setMessages] = useState<any[]>([]);

    const runQuery = async (userQuery: string) => {
        console.log("User query: ", userQuery);
        const response = await window.llocalAiApi.runQuery(userQuery);
        console.log("Response: ", response);
        setMessages(response);
        return response;
    };

    return (
        <div className='chat-layout'>
            <div>
                <Messages messages={messages} />
            </div>
            <div>
                <QueryForm onSubmit={(text: string) => runQuery(text)} />
            </div>
        </div>
    );
};

export default BasicChat;
