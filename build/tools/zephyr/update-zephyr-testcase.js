import { z } from "zod";
import { buildCreateTestCasePayload, buildZephyrTestCaseUrl, extractZephyrTestCaseKey, formatAxiosError, formatZephyrTestCase, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const updateZephyrTestCaseSchema = {
    testCaseKeyOrUrl: z
        .string()
        .describe('Existing test case key or Tests.jspa URL, e.g. "PROJ-T123"'),
    name: z.string().optional().describe("New title"),
    objective: z.string().optional().describe("New objective"),
    precondition: z.string().optional().describe("New precondition"),
    priority: z.string().optional().describe("New priority"),
    status: z.string().optional().describe("New status"),
    folder: z.string().optional().describe("New folder path"),
    customFields: z
        .record(z.string())
        .optional()
        .describe("Custom fields to replace/set on update"),
    steps: z
        .array(z.object({
        description: z.string(),
        testData: z.string().optional(),
        expectedResult: z.string().optional(),
    }))
        .optional()
        .describe("Replace step-by-step script"),
    testScriptText: z.string().optional().describe("Replace plain-text script"),
};
export const updateZephyrTestCaseHandler = (zephyr, jiraConfig) => async ({ testCaseKeyOrUrl, name, objective, precondition, priority, status, folder, customFields, steps, testScriptText, }) => {
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
        const currentResponse = await zephyr.get(`/testcase/${testCaseKey}`);
        const current = currentResponse.data;
        const payload = buildCreateTestCasePayload({
            projectKey: current.projectKey,
            name: name ?? current.name,
            objective: objective ?? current.objective,
            precondition: precondition ?? current.precondition,
            priority: priority ?? current.priority,
            status: status ?? current.status,
            folder: folder ?? current.folder,
            customFields: customFields ?? current.customFields,
            steps: steps ??
                current.testScript?.steps?.map((step) => ({
                    description: step.description,
                    testData: step.testData,
                    expectedResult: step.expectedResult,
                })),
            testScriptText: testScriptText ?? current.testScript?.text,
        });
        await zephyr.put(`/testcase/${testCaseKey}`, payload);
        const updatedResponse = await zephyr.get(`/testcase/${testCaseKey}`);
        return {
            content: [
                {
                    type: "text",
                    text: [
                        `Updated Zephyr test case ${testCaseKey}.`,
                        `URL: ${buildZephyrTestCaseUrl(jiraConfig.host, testCaseKey)}`,
                        "",
                        formatZephyrTestCase(updatedResponse.data, jiraConfig.host),
                    ].join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error updating Zephyr test case:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to update Zephyr test case: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
