import { z } from "zod";
import { buildWorklogJQLForUser } from "../../utils/jql-builder.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getRecentWorklogsSchema = {
    period: z
        .enum(["week", "month", "3months", "6months", "year"])
        .describe("Time period"),
    username: z
        .string()
        .optional()
        .describe("Username to get worklogs for. If not specified, gets your own worklogs"),
    projectKeys: z
        .array(z.string())
        .optional()
        .describe("Filter by specific projects"),
    includeCommunication: z
        .boolean()
        .default(false)
        .describe("Include communication tasks (COM-* issues). Default: false"),
};
export const getRecentWorklogsHandler = (jira, jiraConfig) => async ({ period, username, projectKeys, includeCommunication, }) => {
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
        // Calculate date range based on period
        const now = new Date();
        let startDate;
        const endDate = now.toISOString().split("T")[0];
        switch (period) {
            case "week":
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];
                break;
            case "month":
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];
                break;
            case "3months":
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];
                break;
            case "6months":
                startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];
                break;
            case "year":
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];
                break;
        }
        const jqlQuery = buildWorklogJQLForUser(username, startDate, endDate, projectKeys, includeCommunication);
        const searchResults = await jira.issueSearch.searchForIssuesUsingJql({
            jql: jqlQuery,
            fields: ["key", "summary", "project"],
            maxResults: 50,
            startAt: 0,
        });
        const taskCount = searchResults.issues?.length || 0;
        const userDisplayName = username || "You";
        return {
            content: [
                {
                    type: "text",
                    text: `${userDisplayName} worked on ${taskCount} tasks in the last ${period}`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching recent worklogs:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve recent worklogs: ${error.message}`,
                },
            ],
        };
    }
};
