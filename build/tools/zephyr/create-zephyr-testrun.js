import { z } from "zod";
import { formatAxiosError, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const createZephyrTestRunSchema = {
    projectKey: z
        .string()
        .describe('Zephyr project key, e.g. "PROJ"'),
    name: z.string().describe("Test run title"),
    description: z
        .string()
        .optional()
        .describe("Optional description or link to CI run"),
};
export const createZephyrTestRunHandler = (zephyr, jiraConfig) => async ({ projectKey, name, description, }) => {
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
        const response = await zephyr.post("/testrun", {
            projectKey,
            name,
            description,
        });
        const created = response.data;
        return {
            content: [
                {
                    type: "text",
                    text: [
                        "Created Zephyr test run.",
                        `Key: ${created.key}`,
                        `Project: ${created.projectKey ?? projectKey}`,
                        `Name: ${created.name ?? name}`,
                    ].join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating Zephyr test run:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to create Zephyr test run: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
