import { z } from "zod";
import { extractZephyrTestCaseKey, formatAxiosError, formatZephyrTestCase, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getZephyrTestCaseSchema = {
    testCaseKeyOrUrl: z
        .string()
        .describe('Zephyr test case key (e.g. "PROJ-T123"), or full Tests.jspa URL with #/testCase/KEY'),
};
export const getZephyrTestCaseHandler = (zephyr, jiraConfig) => async ({ testCaseKeyOrUrl }) => {
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
        const testCaseKey = extractZephyrTestCaseKey(testCaseKeyOrUrl);
        const response = await zephyr.get(`/testcase/${testCaseKey}`);
        return {
            content: [
                {
                    type: "text",
                    text: formatZephyrTestCase(response.data, jiraConfig.host),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Zephyr test case:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to fetch Zephyr test case: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
