import { useEffect, useState } from 'react';
import './Workflows.css';

interface Workflow {
    id: string;
    title: string;
    description: string;
    created_at: number;
}

const Workflows = () => {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [output, setOutput] = useState<{ [key: string]: any[] }>({});

    useEffect(() => {
        loadWorkflows();
    }, []);

    const loadWorkflows = async () => {
        try {
            const list = await window.llocalAiApi.getWorkflows();
            setWorkflows(list);
        } catch (e) {
            console.error("Failed to load workflows", e);
        }
    };

    const runWorkflow = async (id: string) => {
        setRunningId(id);
        setOutput({ ...output, [id]: [] });
        try {
            // Optimistic start
            const result = await window.llocalAiApi.runWorkflow(id);
            if (result.success) {
                setOutput(prev => ({ ...prev, [id]: result.results }));
            } else {
                setOutput(prev => ({ ...prev, [id]: [{ status: 'error', error: result.error }] }));
            }
        } catch (e) {
            setOutput(prev => ({ ...prev, [id]: [{ status: 'error', error: String(e) }] }));
        } finally {
            setRunningId(null);
        }
    };

    return (
        <div className="workflows-container">
            <h2>Saved Workflows</h2>
            <div className="workflows-grid">
                {workflows.map(w => (
                    <div key={w.id} className="workflow-card">
                        <h3>{w.title}</h3>
                        <p>{w.description}</p>
                        <div className="workflow-actions">
                            <button
                                className="run-btn"
                                disabled={runningId === w.id}
                                onClick={() => runWorkflow(w.id)}
                            >
                                {runningId === w.id ? 'Running...' : 'Run Workflow'}
                            </button>
                        </div>
                        {output[w.id] && (
                            <div className="workflow-output">
                                <h4>Last Run:</h4>
                                <ul>
                                    {output[w.id]?.map((res: any, idx: number) => (
                                        <li key={idx} className={res.status}>
                                            <strong>{res.name}</strong>: {res.status === 'success' ? (
                                                typeof res.result === 'string' ? res.result.substring(0, 100) + (res.result.length > 100 ? '...' : '') : JSON.stringify(res.result)
                                            ) : res.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Workflows;
