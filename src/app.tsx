import { createRoot } from 'react-dom/client';

const root = createRoot(document.body);
root.render(
    <div className="dashboard">
        <div><p>Side bar</p></div>
        <div><p>Chat Window</p></div>
    </div>
);