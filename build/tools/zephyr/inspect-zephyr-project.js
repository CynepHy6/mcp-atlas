import { z } from "zod";
import { buildTestCaseSearchQuery, formatAxiosError, } from "../../utils/zephyr-utils.js";
import { collectProjectInspection, formatProjectInspection, } from "../../utils/zephyr-wdio-sync.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const inspectZephyrProjectSchema = {
    projectKey: z
        .string()
        .describe('Zephyr projectKey used in test-wdio --qaseProject (e.g. "PROJ"). Call this before creating new cases in an unfamiliar project.'),
    sampleSize: z
        .number()
        .default(20)
        .describe("How many existing cases to scan for custom field values."),
};
export const inspectZephyrProjectHandler = (zephyr, jiraConfig) => async ({ projectKey, sampleSize, }) => {
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
        const response = await zephyr.post("/testcase/search", {
            query: buildTestCaseSearchQuery({ projectKey }),
            maxResults: Math.min(sampleSize, 50),
            startAt: 0,
        });
        const inspection = collectProjectInspection(projectKey, response.data);
        return {
            content: [
                {
                    type: "text",
                    text: formatProjectInspection(inspection, jiraConfig.host),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error inspecting Zephyr project:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to inspect Zephyr project: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
