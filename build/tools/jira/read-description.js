import { z } from "zod";
import { formatIssueDescription } from "../../utils/formatters.js";
import { formatIssueStructure, getIssueStructure, } from "../../utils/issue-relationships.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const readDescriptionSchema = {
    issueKey: z.string().describe("The Jira issue key (e.g., PROJECT-123)"),
};
export const readDescriptionHandler = (jira, jiraConfig) => async ({ issueKey }) => {
    // Validate Jira configuration
    const configError = validateJiraConfig(jiraConfig);
    if (configError) {
        return {
            content: [
                {
                    type: "text",
                    text: `Configuration error: ${configError}\n\nRequired environment variables:\n- JIRA_HOST: Your Jira instance host\n- JIRA_USERNAME: Your Jira username\n- JIRA_PASSWORD or JIRA_API_TOKEN: Your password or personal access token\n\nOptional variables:\n- JIRA_PROTOCOL: https (default) or http\n- JIRA_API_VERSION: 2 (default)\n- JIRA_STRICT_SSL: true (default) or false`,
                },
            ],
        };
    }
    try {
        // Get issue data with expanded fields for relationships
        const issue = await jira.issues.getIssue({
            issueIdOrKey: issueKey,
            expand: ["parent", "subtasks", "issuelinks"],
            fields: ["*all"],
        });
        if (!issue) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Issue ${issueKey} not found`,
                    },
                ],
            };
        }
        // Get issue structure with all related tasks
        const issueStructure = await getIssueStructure(jira, issueKey, jiraConfig.host);
        // Format main issue description
        const formattedDescription = formatIssueDescription(issue);
        // Format issue structure
        const formattedStructure = formatIssueStructure(issueStructure);
        // Combine description and structure
        const fullResponse = `${formattedDescription}\n\n${formattedStructure}`;
        return {
            content: [
                {
                    type: "text",
                    text: fullResponse,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Jira issue:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve issue ${issueKey}: ${error.message}`,
                },
            ],
        };
    }
};
