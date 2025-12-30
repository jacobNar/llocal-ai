import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const responseSchema = z.object({
    response: z.string().describe("The final response to the user."),
});

export const responseTool = tool(
    async ({ response }) => {
        return response;
    },
    {
        name: "Response",
        description: "Always use this tool to provide the final answer to the user.",
        schema: responseSchema,
    }
);
