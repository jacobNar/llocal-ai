import React, { useState, useRef, useEffect } from 'react';
import './QueryForm.css';

type QueryFormProps = {
    onSubmit: (text: string) => void;
};

const QueryForm: React.FC<QueryFormProps> = ({ onSubmit }) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const maxHeight = textarea.parentElement?.clientHeight ?? 200;
            textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
        }
    }, [input]);

    return (
        <div className="query-form-container">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your query..."
                className="query-textarea"
            />
            <button onClick={handleSubmit} className="submit-button">
                Send
            </button>
        </div>
    );
};

export default QueryForm;