import React, { useState } from 'react';
import './TextInputForm.css';

type TextInputFormProps = {
    onSubmit: (text: string) => void;
};

const TextInputForm: React.FC<TextInputFormProps> = ({ onSubmit }) => {
    const [input, setInput] = useState('');

    const handleSubmit = () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setInput('');
    };

    return (
        <div className="text-input-form-container">
            <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter URL"
                className="text-input"
            />
            <button onClick={handleSubmit} className="submit-button">
                Send
            </button>
        </div>
    );
};

export default TextInputForm;