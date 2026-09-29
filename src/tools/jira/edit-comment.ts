import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import {
    buildIssueCommentUrl,
    extractIssueKey,
    formatJiraError,
} from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";

const COMMENT_ID_RE = /^\d+$/;

export const editCommentSchema = {
    issueKey: z
        .string()
        .describe("Issue key or browse URL, e.g. PROJ-123"),
    commentId: z
        .string()
        .describe("Numeric comment id from read-comments"),
    body: z
        .string()
        .describe(
            "New comment text in Jira wiki markup. Replaces the whole comment. Not Markdown.",
        ),
    notifyUsers: z
        .boolean()
        .optional()
        .describe(
            "Notify watchers. Omit to keep the Jira default (true).",
        ),
};

export const editCommentHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({
        issueKey,
        commentId,
        body,
        notifyUsers,
    }: {
        issueKey: string;
        commentId: string;
        body: string;
        notifyUsers?: boolean;
    }) => {
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

        const resolvedCommentId = commentId.trim();
        if (!COMMENT_ID_RE.test(resolvedCommentId)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `commentId must be a numeric Jira comment id, got: ${commentId}`,
                    },
                ],
            };
        }

        if (!body.trim()) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Nothing to update: body is required and replaces the whole comment.",
                    },
                ],
            };
        }

        try {
            // jira.js maps `comment` onto the REST field `body`.
            const updated = await jira.issueComments.updateComment({
                issueIdOrKey: resolvedIssueKey,
                id: resolvedCommentId,
                comment: body,
                ...(notifyUsers !== undefined ? { notifyUsers } : {}),
            });

            const resultId = updated?.id || resolvedCommentId;
            const resultLines = [
                "Comment updated successfully",
                `Issue: ${resolvedIssueKey}`,
                `Comment id: ${resultId}`,
                `URL: ${buildIssueCommentUrl(jiraConfig.host, resolvedIssueKey, resultId)}`,
            ];

            return {
                content: [
                    {
                        type: "text",
                        text: resultLines.join("\n"),
                    },
                ],
            };
        } catch (error) {
            console.error("Error updating Jira comment:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to update comment ${resolvedCommentId} on ${resolvedIssueKey}: ${formatJiraError(error)}`,
                    },
                ],
            };
        }
    };
