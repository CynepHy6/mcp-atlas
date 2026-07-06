import { z } from "zod";
import { buildTestCaseSearchQuery, formatAxiosError, formatZephyrTestCaseList, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const searchZephyrTestCasesSchema = {
    projectKey: z
        .string()
        .optional()
        .describe('Zephyr project key (e.g. "PROJ"). Required unless raw query is provided.'),
    text: z
        .string()
        .optional()
        .describe("Optional free-text filter for testcase name/objective"),
    query: z
        .string()
        .optional()
        .describe('Raw Zephyr IQL-like query. If set, overrides projectKey/text builder. Example: projectKey = "PROJ" AND text ~ "login"'),
    maxResults: z
        .number()
        .default(20)
        .describe("Maximum number of results (default: 20, max: 100)"),
    startAt: z
        .number()
        .default(0)
        .describe("Pagination offset (default: 0)"),
};
export const searchZephyrTestCasesHandler = (zephyr, jiraConfig) => async ({ projectKey, text, query, maxResults, startAt, }) => {
    const configError = validateJiraConfig(jiraConfig);
    if (configError) {
        return {
            content: [
                {
                    type: "text",
                    text: `Configuration error: ${configError}`,
                },
            ],
        };
    }
    try {
        const effectiveQuery = query && query.trim().length > 0
            ? query.trim()
            : buildTestCaseSearchQuery({ projectKey, text });
        const response = await zephyr.post("/testcase/search", {
            query: effectiveQuery,
            maxResults: Math.min(maxResults, 100),
            startAt,
        });
        return {
            content: [
                {
                    type: "text",
                    text: formatZephyrTestCaseList(response.data, jiraConfig.host, effectiveQuery),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error searching Zephyr test cases:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to search Zephyr test cases: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
