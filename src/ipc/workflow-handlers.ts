import { ipcMain } from 'electron';
import { InferenceClient } from "@huggingface/inference";
import { getDb } from '../services/db';
import { toolsMapExport } from '../agent/agent-service';
import { initBrowser, getBrowser } from '../services/browser-service';

export const registerWorkflowHandlers = () => {
    const db = getDb();

    // We access the tools map from the agent service. 
    // Ideally tools should be in a shared registry, but exporting from agent-service works for now.

    ipcMain.handle("getWorkflows", async () => {
        return db.getWorkflows();
    });

    ipcMain.handle("saveWorkflow", async (event, conversationId: string) => {
        try {
            const messages = db.getMessages(conversationId);
            if (messages.length === 0) return { success: false, error: "No messages found" };
            interface ExtractedToolCall {
                name: string;
                args: any;
                status: 'pending' | 'success' | 'failed';
            }

            const workflowToolCalls: ExtractedToolCall[] = [];

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];

                if (msg.role === 'assistant') {
                    const lines = msg.content.split('\n');
                    const callsInMessage: { name: string; args: any }[] = [];

                    for (const line of lines) {
                        const match = line.match(/Executing tool: (.*?) Args: (.*)/);
                        if (match) {
                            try {
                                const name = match[1].trim();
                                if (name !== 'Response') {
                                    callsInMessage.push({
                                        name: name,
                                        args: JSON.parse(match[2].trim())
                                    });
                                }
                            } catch (e) {
                                console.error("Failed to parse tool log:", line);
                            }
                        }
                    }

                    if (callsInMessage.length > 0) {
                        let toolsFound = 0;
                        for (let j = i + 1; j < messages.length; j++) {
                            const nextMsg = messages[j];
                            if (nextMsg.role === 'tool') {
                                if (toolsFound < callsInMessage.length) {
                                    const call = callsInMessage[toolsFound];
                                    const content = nextMsg.content;
                                    const isError = content.includes("Error:") || content.includes("Tool execution error:") || content.includes("Error retrieving") || content.includes("Error clicking");

                                    if (!isError) {
                                        workflowToolCalls.push({
                                            name: call.name,
                                            args: call.args,
                                            status: 'success'
                                        });
                                    }
                                    toolsFound++;
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                    }
                }
            }

            if (workflowToolCalls.length === 0) {
                return { success: false, error: "No successful tool calls found to save." };
            }

            const toolCallSummary = workflowToolCalls.map(c => `${c.name}: ${JSON.stringify(c.args)}`).join("\n");
            const userGoal = messages.find(m => m.role === 'user')?.content || "User Goal";

            const prompt = `
            User Goal: ${userGoal}
            
            Successful Tool Sequence:
            ${toolCallSummary}
            
            Generate a concise Title and a short Description for this workflow.
            Return strictly JSON: { "title": "...", "description": "..." }
            `;

            const client = new InferenceClient(process.env.HF_TOKEN);
            const completion = await client.chatCompletion({
                model: "meta-llama/Llama-3.1-70B-Instruct",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.7,
                response_format: { type: "json_object" }
            });

            const resultText = completion.choices[0].message.content || "{}";
            let resultJson;
            try {
                resultJson = JSON.parse(resultText);
            } catch (e) {
                return { success: false, error: "Failed to parse LLM output" };
            }

            const id = db.createWorkflow(resultJson.title || "Untitled Workflow", resultJson.description || "No description", JSON.stringify(workflowToolCalls));
            return { success: true, id: id, workflow: { ...resultJson, tool_calls: workflowToolCalls } };

        } catch (e) {
            console.error("Error saving workflow", e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle("runWorkflow", async (event, workflowId: string) => {
        try {
            const workflow = db.getWorkflow(workflowId);
            if (!workflow) return { success: false, error: "Workflow not found" };

            const toolCalls = JSON.parse(workflow.tool_calls);
            const results = [];
            const toolsMap = toolsMapExport();
            // Ensure toolsMap is available. It should be if agent service is initialized.
            // But runQuery initializes agent. We need to ensure agent is init before this if not already.

            for (const call of toolCalls) {
                const tool = toolsMap[call.name];
                if (!tool) {
                    results.push({ name: call.name, status: "error", error: "Tool not found" });
                    continue;
                }
                try {
                    let browser = getBrowser();
                    if (!browser || !browser.isConnected()) {
                        browser = await initBrowser();
                    }

                    console.log(`Running workflow tool: ${call.name}`, call.args);
                    const result = await tool.invoke(call.args);
                    results.push({ name: call.name, status: "success", result: result });
                } catch (e) {
                    results.push({ name: call.name, status: "error", error: String(e) });
                    break;
                }
            }
            return { success: true, results: results };

        } catch (e) {
            console.error("Error running workflow", e);
            return { success: false, error: String(e) };
        }
    });
}
