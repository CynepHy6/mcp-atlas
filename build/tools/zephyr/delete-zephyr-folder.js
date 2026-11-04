import { z } from "zod";
import { formatAxiosError } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const deleteZephyrFolderSchema = {
    folderId: z
        .number()
        .int()
        .describe("Numeric folder id (from get-zephyr-folder-tree)."),
    confirm: z
        .literal(true)
        .describe("Must be true. Destructive: permanently deletes the folder. Run get-zephyr-folder-tree first to confirm the id and that it is empty."),
};
// Deletes a folder via the internal /rest/tests/1.0 API (zephyrTests client).
// The public ATM API has no folder-delete endpoint.
export const deleteZephyrFolderHandler = (zephyrTests, jiraConfig) => async ({ folderId, confirm, }) => {
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
        await zephyrTests.delete(`/folder/${folderId}`);
        return {
            content: [
                {
                    type: "text",
                    text: `Deleted Zephyr folder with id ${folderId}.`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error deleting Zephyr folder:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to delete Zephyr folder: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
