import { z } from "zod";
import { formatSearchResults } from "../../utils/formatters.js";
import { formatJiraError } from "../../utils/jira-issue.js";
import { buildSearchJQL } from "../../utils/jql-builder.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const searchIssuesSchema = {
    query: z
        .string()
        .describe("Search query to look for in issue title and description"),
    maxResults: z
        .number()
        .default(20)
        .describe("Maximum number of results (default: 20, max: 100)"),
    projectKeys: z
        .array(z.string())
        .optional()
        .describe("Filter by specific project keys (optional)"),
    status: z
        .array(z.string())
        .optional()
        .describe("Filter by issue status (e.g., ['Open', 'In Progress', 'Done'])"),
    assignee: z
        .string()
        .optional()
        .describe("Filter by assignee username or 'currentUser()'"),
    includeDescription: z
        .boolean()
        .default(false)
        .describe("Include truncated issue description in results (default: false)"),
};
export const searchIssuesHandler = (jira, jiraConfig) => async ({ query, maxResults = 20, projectKeys, status, assignee, includeDescription = false, }) => {
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
    if (!query || !query.trim()) {
        return {
            content: [
                {
                    type: "text",
                    text: "Search query must not be empty.",
                },
            ],
        };
    }
    try {
        const jqlQuery = buildSearchJQL(query, projectKeys, status, assignee);
        console.error("JQL Query:", jqlQuery);
        console.error("Jira host:", jiraConfig.host);
        console.error("Search parameters:", {
            jql: jqlQuery,
            maxResults: maxResults,
            startAt: 0,
        });
        const fields = [
            "key",
            "summary",
            ...(includeDescription ? ["description"] : []),
            "issuetype",
            "priority",
            "status",
            "assignee",
            "project",
            "created",
            "updated",
        ];
        const searchResults = await jira.issueSearch.searchForIssuesUsingJql({
            jql: jqlQuery,
            fields,
            maxResults: maxResults,
            startAt: 0,
        });
        if (!searchResults.issues || searchResults.issues.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No issues found for query: "${query}"`,
                    },
                ],
            };
        }
        const formattedResults = formatSearchResults(searchResults, query, jiraConfig.host, includeDescription);
        return {
            content: [
                {
                    type: "text",
                    text: formattedResults,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error searching Jira issues:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Search failed: ${formatJiraError(error)}`,
                },
            ],
        };
    }
};
