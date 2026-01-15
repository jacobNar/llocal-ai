import { ipcMain } from 'electron';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { getDb } from '../services/db';
import { getAgent } from '../agent/agent-service';

export const registerChatHandlers = () => {
    const db = getDb();
    const agent = getAgent();

    ipcMain.handle('runQuery', async (event, { message, conversationId }: { message: string, conversationId?: string }) => {
        try {
            console.log("runQuery called with message: ", message, " conversationId: ", conversationId);

            if (!conversationId) {
                conversationId = db.createConversation(message.substring(0, 30) + "...");
            }

            db.addMessage(conversationId, 'user', message);

            const config = {
                configurable: { thread_id: conversationId },
                recursionLimit: 50
            };

            const result = await agent.invoke({
                messages: [new HumanMessage(message)],
                userGoal: !conversationId ? message : ""
            }, config);

            const messages = result.messages;
            const lastMsg = messages[messages.length - 1];

            let finalResponse = lastMsg.content;
            if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
                const lastTool = lastMsg.tool_calls[0];
                if (lastTool.name === "Response") {
                    finalResponse = lastTool.args.response;
                }
            }

            const allMessages = result.messages;
            let startIndex = -1;
            for (let i = allMessages.length - 1; i >= 0; i--) {
                if (allMessages[i] instanceof HumanMessage && allMessages[i].content === message) {
                    startIndex = i;
                    break;
                }
            }

            if (startIndex !== -1) {
                const newMessages = allMessages.slice(startIndex + 1);

                for (const msg of newMessages) {
                    if (msg instanceof AIMessage) {
                        if (msg.tool_calls && msg.tool_calls.length > 0) {
                            const toolCalls = msg.tool_calls;
                            const responseTool = toolCalls.find((tc: any) => tc.name === "Response");

                            if (responseTool) {
                                const responseContent = JSON.stringify(responseTool.args);
                                db.addMessage(conversationId, 'assistant', responseContent);
                            } else {
                                const toolLog = toolCalls.map((tc: any) => {
                                    const name = tc.name || (tc as any).function?.name || 'Unknown Tool';
                                    const args = tc.args || (tc as any).function?.arguments || {};
                                    return `Executing tool: ${name} Args: ${JSON.stringify(args)}`;
                                }).join("\n");

                                db.addMessage(conversationId, 'assistant', toolLog);
                            }
                        } else if (msg.content) {
                            db.addMessage(conversationId, 'assistant', msg.content.toString());
                        }
                    } else if (msg instanceof ToolMessage) {
                        db.addMessage(conversationId, 'tool', `Tool Output (${msg.name}): ${msg.content.toString()}`);
                    }
                }
            } else {
                db.addMessage(conversationId, 'assistant', String(finalResponse));
            }

            return {
                messages: messages.map((m: BaseMessage) => {
                    let role = 'unknown';
                    const type = m._getType();
                    if (type === 'human') role = 'user';
                    else if (type === 'ai') role = 'assistant';
                    else if (type === 'system') role = 'system';
                    else if (type === 'tool') role = 'tool';

                    return {
                        content: m.content,
                        role: role
                    };
                }),
                final_response: finalResponse,
                conversationId: conversationId
            };

        } catch (error) {
            console.error("Error in runQuery:", error);
            return error;
        }
    });

    ipcMain.handle('getHistory', async () => {
        return db.getConversations();
    });

    ipcMain.handle('loadConversation', async (event, conversationId: string) => {
        return db.getMessages(conversationId);
    });

    ipcMain.handle('deleteConversation', async (event, conversationId: string) => {
        try {
            db.deleteConversation(conversationId);
            return { success: true };
        } catch (error) {
            console.error("Error deleting conversation:", error);
            return { success: false, error: error };
        }
    });
}
