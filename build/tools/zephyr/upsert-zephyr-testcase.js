import { z } from "zod";
import { buildCreateTestCasePayload, buildTestCaseSearchQuery, extractZephyrTestCaseKey, formatAxiosError, } from "../../utils/zephyr-utils.js";
import { buildDefaultCustomFields, collectProjectInspection, fetchReferenceCustomFields, formatUpsertResult, mergeUpsertName, parseWdioItTitle, resolveUpsertSteps, zephyrUpsertFieldsSchema, } from "../../utils/zephyr-wdio-sync.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const upsertZephyrTestCaseSchema = {
    ...zephyrUpsertFieldsSchema,
    projectKey: z
        .string()
        .optional()
        .describe("Required when creating a new case (no #PREFIX-Tnnn in wdioItTitle). Usually equals test-wdio --qaseProject."),
    testCaseKeyOrUrl: z
        .string()
        .optional()
        .describe("Explicit case key or URL. Overrides #suffix parsed from wdioItTitle. Use for updates when you only have the key."),
    inheritCustomFieldsFrom: z
        .string()
        .optional()
        .describe("Existing case key in the same project. On create, copies its customFields when customFields are not provided."),
    automationStatus: z
        .enum(["automated", "is-not-automated", "to-be-automated"])
        .optional()
        .describe("Shortcut for Automation status custom field on create. Prefer is-not-automated until wdio reports results to Zephyr."),
};
const resolveTargetKey = (input) => {
    if (input.testCaseKeyOrUrl && input.testCaseKeyOrUrl.trim().length > 0) {
        return extractZephyrTestCaseKey(input.testCaseKeyOrUrl);
    }
    if (input.wdioItTitle && input.wdioItTitle.trim().length > 0) {
        return parseWdioItTitle(input.wdioItTitle).testCaseKey;
    }
    return undefined;
};
const resolveCustomFieldsForCreate = async (zephyr, projectKey, input) => {
    if (input.customFields && Object.keys(input.customFields).length > 0) {
        return input.customFields;
    }
    if (input.inheritCustomFieldsFrom &&
        input.inheritCustomFieldsFrom.trim().length > 0) {
        const inherited = await fetchReferenceCustomFields(zephyr, extractZephyrTestCaseKey(input.inheritCustomFieldsFrom));
        if (inherited) {
            return inherited;
        }
    }
    const searchResponse = await zephyr.post("/testcase/search", {
        query: buildTestCaseSearchQuery({ projectKey }),
        maxResults: 20,
        startAt: 0,
    });
    const inspection = collectProjectInspection(projectKey, searchResponse.data);
    const defaults = buildDefaultCustomFields(inspection, input.customFields);
    if (input.automationStatus) {
        return {
            ...(defaults ?? {}),
            "Automation status": input.automationStatus,
        };
    }
    return defaults;
};
export const upsertZephyrTestCaseHandler = (zephyr, jiraConfig) => async (input) => {
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
        const targetKey = resolveTargetKey(input);
        const resolvedSteps = resolveUpsertSteps(input);
        const resolvedName = mergeUpsertName(input.name, input.wdioItTitle);
        if (targetKey) {
            const currentResponse = await zephyr.get(`/testcase/${targetKey}`);
            const current = currentResponse.data;
            const payload = buildCreateTestCasePayload({
                projectKey: current.projectKey,
                name: resolvedName,
                objective: input.objective !== undefined
                    ? input.objective
                    : current.objective,
                precondition: input.precondition !== undefined
                    ? input.precondition
                    : current.precondition,
                priority: input.priority !== undefined
                    ? input.priority
                    : current.priority,
                status: input.status !== undefined
                    ? input.status
                    : current.status,
                folder: input.folder !== undefined
                    ? input.folder
                    : current.folder,
                customFields: input.customFields !== undefined
                    ? input.customFields
                    : current.customFields,
                steps: resolvedSteps ??
                    current.testScript?.steps?.map((step) => ({
                        description: step.description,
                        testData: step.testData,
                        expectedResult: step.expectedResult,
                    })),
            });
            await zephyr.put(`/testcase/${targetKey}`, payload);
            const updatedResponse = await zephyr.get(`/testcase/${targetKey}`);
            return {
                content: [
                    {
                        type: "text",
                        text: formatUpsertResult({
                            action: "updated",
                            testCase: updatedResponse.data,
                            host: jiraConfig.host,
                            wdioItTitle: input.wdioItTitle,
                        }),
                    },
                ],
            };
        }
        if (!input.projectKey || input.projectKey.trim().length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: [
                            "Cannot create Zephyr test case: projectKey is required when wdioItTitle has no #PREFIX-Tnnn suffix.",
                            "Workflow:",
                            "1. inspect-zephyr-project with projectKey from test-wdio --qaseProject",
                            "2. upsert-zephyr-testcase with projectKey + wdioItTitle + testScriptPlainText",
                        ].join("\n"),
                    },
                ],
            };
        }
        const customFields = await resolveCustomFieldsForCreate(zephyr, input.projectKey, input);
        const payload = buildCreateTestCasePayload({
            projectKey: input.projectKey,
            name: resolvedName,
            objective: input.objective,
            precondition: input.precondition,
            priority: input.priority,
            status: input.status,
            folder: input.folder,
            customFields,
            steps: resolvedSteps,
        });
        const response = await zephyr.post("/testcase", payload);
        const createdKey = response.data.key;
        const createdResponse = createdKey
            ? await zephyr.get(`/testcase/${createdKey}`)
            : response;
        return {
            content: [
                {
                    type: "text",
                    text: formatUpsertResult({
                        action: "created",
                        testCase: createdResponse.data,
                        host: jiraConfig.host,
                        wdioItTitle: input.wdioItTitle,
                    }),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error upserting Zephyr test case:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to upsert Zephyr test case: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
