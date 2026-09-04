import { z } from "zod";
import { formatComments } from "../../utils/formatters.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const readCommentsSchema = {
    issueKey: z.string().describe("The Jira issue key (e.g., PROJECT-123)"),
};
export const readCommentsHandler = (jira, jiraConfig) => async ({ issueKey }) => {
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
        const comments = await jira.issueComments.getComments({
            issueIdOrKey: issueKey,
        });
        if (!comments ||
            !comments.comments ||
            comments.comments.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No comments found for issue ${issueKey}`,
                    },
                ],
            };
        }
        // Format comments using the refactored function
        const commentsText = formatComments(issueKey, comments.comments);
        return {
            content: [
                {
                    type: "text",
                    text: commentsText,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Jira comments:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve comments for ${issueKey}: ${error.message}`,
                },
            ],
        };
    }
};
