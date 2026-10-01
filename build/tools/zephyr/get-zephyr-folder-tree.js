import { z } from "zod";
import { formatAxiosError, formatFolderTree, } from "../../utils/zephyr-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getZephyrFolderTreeSchema = {
    project: z
        .string()
        .describe('Project key (e.g. "GRW"), numeric projectId, or a Tests.jspa URL containing projectId=NNNNN.'),
};
// Resolves a project key to its numeric projectId. Accepts a numeric id or a
// Tests.jspa URL (projectId=NNNNN) directly to avoid the lookup.
const resolveProjectId = async (zephyrTests, project) => {
    const trimmed = project.trim();
    const urlMatch = trimmed.match(/projectId=(\d+)/i);
    if (urlMatch) {
        return { id: urlMatch[1] };
    }
    if (/^\d+$/.test(trimmed)) {
        return { id: trimmed };
    }
    const response = await zephyrTests.get("/project");
    const projects = Array.isArray(response.data) ? response.data : [];
    const match = projects.find((p) => p.key?.toUpperCase() === trimmed.toUpperCase());
    if (!match) {
        const keys = projects
            .map((p) => p.key)
            .filter(Boolean)
            .join(", ");
        throw new Error(`Project "${trimmed}" not found. Pass a numeric projectId or a known key. Available keys: ${keys}`);
    }
    return { id: String(match.id), key: match.key };
};
// Reads the test-case folder tree. The public ATM API has no folder-read
// endpoint, so this uses the internal /rest/tests/1.0 API (zephyrTests client).
export const getZephyrFolderTreeHandler = (zephyrTests, jiraConfig) => async ({ project }) => {
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
        const { id, key } = await resolveProjectId(zephyrTests, project);
        const response = await zephyrTests.get(`/project/${id}/foldertree/testcase`);
        return {
            content: [
                {
                    type: "text",
                    text: formatFolderTree(response.data, key ?? "the project"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Zephyr folder tree:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to fetch Zephyr folder tree: ${formatAxiosError(error)}`,
                },
            ],
        };
    }
};
