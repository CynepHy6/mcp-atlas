import { z } from "zod";
import { formatAxiosError } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const createZephyrFolderSchema = {
    projectKey: z.string().describe('Zephyr project key, e.g. "GRW".'),
    name: z
        .string()
        .describe('Folder name or full folder path. A leading "/" is added automatically. When parentPath is set, pass just the child folder name.'),
    parentPath: z
        .string()
        .optional()
        .describe('Optional parent folder path, e.g. "/C0/[H] Авторизация". Combined with name into a full path.'),
    type: z
        .enum(["TEST_CASE", "TEST_PLAN", "TEST_RUN"])
        .optional()
        .describe("Folder type. Defaults to TEST_CASE."),
};
const stripSlashes = (value) => value.replace(/^\/+|\/+$/g, "");
// Creates a folder via the public ATM API (POST /folder). Zephyr expects the
// `name` field to be the full path starting with "/".
export const createZephyrFolderHandler = (zephyr, jiraConfig) => async ({ projectKey, name, parentPath, type, }) => {
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
    const childName = stripSlashes(name);
    if (!childName) {
        return {
            content: [
                {
                    type: "text",
                    text: "Folder name is empty after trimming slashes. Provide a non-empty folder name.",
                },
            ],
        };
    }
    const fullPath = parentPath
        ? `/${stripSlashes(parentPath)}/${childName}`
        : `/${childName}`;
    const folderType = type ?? "TEST_CASE";
    try {
        const response = await zephyr.post("/folder", {
            projectKey,
            name: fullPath,
            type: folderType,
        });
        const id = response.data?.id;
        return {
            content: [
                {
                    type: "text",
                    text: [
                        "Created Zephyr folder.",
                        `Project: ${projectKey}`,
                        `Type: ${folderType}`,
                        `Path: ${fullPath}`,
                        id !== undefined ? `Folder id: ${id}` : null,
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating Zephyr folder:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to create Zephyr folder: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
