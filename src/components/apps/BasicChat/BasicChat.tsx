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
    const [isSaving, setIsSaving] = useState(false);


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
            setMessages(response.messages);
        }
        return response;
    };

    const saveWorkflow = async () => {
        if (!currentThreadId) return;
        setIsSaving(true);
        try {
            const result = await window.llocalAiApi.saveWorkflow(currentThreadId);
            if (result && result.success) {
                alert(`Workflow saved: ${result.workflow.title}`);
            } else {
                alert(`Failed to save workflow: ${result?.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error saving workflow");
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <div className='chat-layout'>
            <div>
                <Messages messages={messages} />
            </div>
            {currentThreadId && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
                    <button
                        onClick={saveWorkflow}
                        disabled={isSaving}
                        style={{ padding: '5px 10px', background: '#e91e63', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {isSaving ? 'Saving...' : 'Save Workflow'}
                    </button>
                </div>
            )}
            <div>
                <QueryForm onSubmit={(text: string) => runQuery(text)} />
            </div>
        </div>
    );
};

export default BasicChat;
