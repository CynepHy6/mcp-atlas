import { z } from "zod";
import { extractZephyrTestCaseKey, formatAxiosError, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const sendZephyrTestResultSchema = {
    testRunKey: z
        .string()
        .describe('Test run key, e.g. "PROJ-C42"'),
    testCaseKeyOrUrl: z
        .string()
        .describe('Test case key or URL, e.g. "PROJ-T123"'),
    status: z
        .enum(["Pass", "Fail", "Blocked", "Not Executed"])
        .describe("Execution status"),
    comment: z
        .string()
        .optional()
        .describe("Execution comment; HTML is supported"),
    executionTime: z
        .number()
        .optional()
        .describe("Execution time in milliseconds"),
};
export const sendZephyrTestResultHandler = (zephyr, jiraConfig) => async ({ testRunKey, testCaseKeyOrUrl, status, comment, executionTime, }) => {
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
        const response = await zephyr.post(`/testrun/${testRunKey}/testcase/${testCaseKey}/testresult`, {
            status,
            comment,
            executionTime,
        });
        return {
            content: [
                {
                    type: "text",
                    text: [
                        "Recorded Zephyr test result.",
                        `Test run: ${testRunKey}`,
                        `Test case: ${testCaseKey}`,
                        `Status: ${status}`,
                        `Result id: ${response.data.id ?? "n/a"}`,
                    ].join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error sending Zephyr test result:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to send Zephyr test result: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
