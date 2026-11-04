import { z } from "zod";
import { buildCreateTestCasePayload, buildZephyrTestCaseUrl, formatAxiosError, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const createZephyrTestCaseSchema = {
    projectKey: z
        .string()
        .describe('Zephyr project key (e.g. "PROJ"). Case key prefix may differ.'),
    name: z.string().describe("Test case title"),
    objective: z.string().optional().describe("Objective / description"),
    precondition: z.string().optional().describe("Preconditions"),
    priority: z
        .string()
        .optional()
        .describe('Priority, e.g. "High", "Normal", "Low"'),
    status: z
        .string()
        .optional()
        .describe('Initial status if supported by project, e.g. "Draft"'),
    folder: z
        .string()
        .optional()
        .describe('Folder path, e.g. "/C0/Some folder"'),
    customFields: z
        .record(z.string())
        .optional()
        .describe("Required project-specific custom fields. Inspect an existing testcase in the target project if creation fails."),
    steps: z
        .array(z.object({
        description: z.string(),
        testData: z.string().optional(),
        expectedResult: z.string().optional(),
    }))
        .optional()
        .describe("Step-by-step script. Use description with HTML <br /> if needed."),
    testScriptText: z
        .string()
        .optional()
        .describe("Plain-text test script alternative to steps"),
};
export const createZephyrTestCaseHandler = (zephyr, jiraConfig) => async ({ projectKey, name, objective, precondition, priority, status, folder, customFields, steps, testScriptText, }) => {
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
        const payload = buildCreateTestCasePayload({
            projectKey,
            name,
            objective,
            precondition,
            priority,
            status,
            folder,
            customFields,
            steps,
            testScriptText,
        });
        const response = await zephyr.post("/testcase", payload);
        const created = response.data;
        const key = created.key ?? "unknown";
        return {
            content: [
                {
                    type: "text",
                    text: [
                        "Created Zephyr test case.",
                        `Key: ${key}`,
                        `Project: ${created.projectKey ?? projectKey}`,
                        `URL: ${buildZephyrTestCaseUrl(jiraConfig.host, key)}`,
                    ].join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating Zephyr test case:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to create Zephyr test case: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
