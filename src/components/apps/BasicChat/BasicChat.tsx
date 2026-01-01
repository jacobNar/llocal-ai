import { useState, useContext, useEffect } from 'react';
import Messages from '../../shared/Messages/Messages';
import QueryForm from '../../shared/QueryForm/QueryForm';
import { AppContext } from '../../../contexts/AppContext'; // Corrected Import Path
import '../../../index.css';

interface ChatMessage {
    role: string;
    content: string;
}

const BasicChat = () => {

    const ctx = useContext(AppContext);
    const { currentThreadId, setCurrentThreadId } = ctx || {};
    const [messages, setMessages] = useState<any[]>([]);

    if (!ctx) return null; // Safe guard

    useEffect(() => {
        if (currentThreadId) {
            loadMessages(currentThreadId);
        } else {
            setMessages([]);
        }
    }, [currentThreadId]);

    const loadMessages = async (id: string) => {
        try {
            const history = await window.llocalAiApi.loadConversation(id);
            const mapped = history.map((m: any) => ({
                content: m.content,
                role: m.role
            }));
            setMessages(mapped);
        } catch (e) {
            console.error("Failed to load conversation", e);
        }
    }

    const runQuery = async (userQuery: string) => {
        console.log("User query: ", userQuery);
        const response = await window.llocalAiApi.runQuery(userQuery, currentThreadId || undefined);
        console.log("Response: ", response);

        if (response.conversationId && response.conversationId !== currentThreadId) {
            if (setCurrentThreadId) setCurrentThreadId(response.conversationId);
        }
        if (response.messages) {
            const newAiMsg = { content: response.final_response, role: 'assistant' };
            const newUserMsg = { content: userQuery, role: 'user' };
            setMessages(prev => [...prev, newUserMsg, newAiMsg]);
        }
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
