import { z } from "zod";
import { formatInsightSearchResults, } from "../../utils/insight-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const searchInsightAssetsSchema = {
    iql: z
        .string()
        .describe('Insight IQL query, e.g. Key = "INFRA-1097573", Name = "Growth", objectType = Team'),
    maxResults: z
        .number()
        .default(20)
        .describe("Maximum number of results (default: 20, max: 100)"),
};
export const searchInsightAssetsHandler = (insight, jiraConfig) => async ({ iql, maxResults }) => {
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
    const resultPerPage = Math.min(Math.max(maxResults, 1), 100);
    try {
        const response = await insight.get("/iql/objects", {
            params: {
                iql,
                resultPerPage,
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: formatInsightSearchResults(response.data, jiraConfig.host, `IQL: ${iql}`),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error searching Insight assets:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Insight search failed: ${error.message}`,
                },
            ],
        };
    }
};
