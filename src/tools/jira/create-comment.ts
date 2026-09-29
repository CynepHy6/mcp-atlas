import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import {
    buildIssueCommentUrl,
    extractIssueKey,
    formatJiraError,
} from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";

export const createCommentSchema = {
    issueKey: z
        .string()
        .describe("Issue key or browse URL, e.g. PROJ-123"),
    body: z
        .string()
        .describe(
            "Comment text in Jira wiki markup (h2., *bold*, {{code}}, * lists). Not Markdown.",
        ),
};

export const createCommentHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({ issueKey, body }: { issueKey: string; body: string }) => {
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

        const resolvedIssueKey = extractIssueKey(issueKey);
        if (!resolvedIssueKey) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Cannot extract issue key from issueKey: ${issueKey}`,
                    },
                ],
            };
        }

        if (!body.trim()) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Nothing to post: body is required.",
                    },
                ],
            };
        }

        try {
            // jira.js maps `comment` onto the REST field `body`.
            const created = await jira.issueComments.addComment({
                issueIdOrKey: resolvedIssueKey,
                comment: body,
            });

            const commentId = created?.id;
            const resultLines = [
                "Comment created successfully",
                `Issue: ${resolvedIssueKey}`,
            ];
            if (commentId) {
                resultLines.push(`Comment id: ${commentId}`);
                resultLines.push(
                    `URL: ${buildIssueCommentUrl(jiraConfig.host, resolvedIssueKey, commentId)}`,
                );
            }

            return {
                content: [
                    {
                        type: "text",
                        text: resultLines.join("\n"),
                    },
                ],
            };
        } catch (error) {
            console.error("Error creating Jira comment:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to create comment on ${resolvedIssueKey}: ${formatJiraError(error)}`,
                    },
                ],
            };
        }
    };
