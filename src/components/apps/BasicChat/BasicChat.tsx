import { useState, useContext, useEffect } from 'react';
import Messages from '../../shared/Messages/Messages';
import QueryForm from '../../shared/QueryForm/QueryForm';
import { AppContext } from '../../../contexts/AppContext'; // Corrected Import Path
import '../../../index.css';
import './BasicChat.css';

interface ChatMessage {
    role: string;
    content: string;
}

const BasicChat = () => {

    const ctx = useContext(AppContext);
    const { currentThreadId, setCurrentThreadId } = ctx || {};
    const [messages, setMessages] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);


    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        if (!currentThreadId) return;
        try {
            const result = await window.llocalAiApi.deleteConversation(currentThreadId);
            if (result.success) {
                if (setCurrentThreadId) setCurrentThreadId(null);
                setMessages([]);
                alert("Conversation deleted successfully");
                if (ctx.triggerRefresh) ctx.triggerRefresh();
            } else {
                alert(`Failed to delete conversation: ${result.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error deleting conversation");
        } finally {
            setShowDeleteConfirm(false);
        }
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
    };


    return (
        <div className='chat-layout'>
            <div>
                <Messages messages={messages} />
            </div>
            {currentThreadId && (
                <div className="chat-tools-container">
                    <button
                        onClick={saveWorkflow}
                        disabled={isSaving}
                        className="tool-btn save-workflow-btn"
                    >
                        {isSaving ? 'Saving...' : 'Save Workflow'}
                    </button>
                    <button
                        onClick={handleDeleteClick}
                        className="tool-btn delete-conv-btn"
                    >
                        Delete Conversation
                    </button>
                </div>
            )}

            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 className="modal-title">Delete Conversation?</h3>
                        <p>Are you sure you want to delete this conversation? This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button
                                onClick={cancelDelete}
                                className="modal-btn cancel-btn"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="modal-btn confirm-delete-btn"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <QueryForm onSubmit={(text: string) => runQuery(text)} />
            </div>
        </div>
    );
};

export default BasicChat;
