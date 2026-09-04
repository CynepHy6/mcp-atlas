import { z } from "zod";
import { extractInsightObjectKey, formatInsightObject, } from "../../utils/insight-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getInsightAssetSchema = {
    objectKeyOrUrl: z
        .string()
        .describe('Insight asset object key (e.g. "INFRA-1097573"), numeric object id, or full Insight asset URL'),
};
export const getInsightAssetHandler = (insight, jiraConfig) => async ({ objectKeyOrUrl }) => {
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
        const identifier = extractInsightObjectKey(objectKeyOrUrl);
        let object;
        if (identifier.kind === "id") {
            const response = await insight.get(`/object/${identifier.value}`);
            object = response.data;
        }
        else {
            const searchResponse = await insight.get("/iql/objects", {
                params: {
                    iql: `Key = "${identifier.value}"`,
                    resultPerPage: 1,
                },
            });
            const entry = searchResponse.data.objectEntries?.[0];
            if (!entry) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Insight asset not found for key: ${identifier.value}`,
                        },
                    ],
                };
            }
            const response = await insight.get(`/object/${entry.id}`);
            object = response.data;
        }
        return {
            content: [
                {
                    type: "text",
                    text: formatInsightObject(object, jiraConfig.host),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Insight asset:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to fetch Insight asset: ${error.message}`,
                },
            ],
        };
    }
};
