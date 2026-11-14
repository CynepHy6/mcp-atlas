import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import {
    formatComments,
    formatIssueDescription,
} from "../../utils/formatters.js";
import {
    formatIssueStructure,
    getIssueStructure,
    ISSUE_STRUCTURE_FIELDS,
} from "../../utils/issue-relationships.js";
import {
    extractIssueKey,
    formatJiraError,
} from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";
import {
    fetchIssueComments,
    type EmbeddedCommentPage,
} from "./read-comments.js";

export const ISSUE_DESCRIPTION_FIELDS = [
    ...ISSUE_STRUCTURE_FIELDS,
    "description",
    "labels",
    "timetracking",
    "timeoriginalestimate",
    "timeestimate",
    "timespent",
] as const;

export const readDescriptionSchema = {
    issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJECT-123) or browse URL"),
    includeComments: z
        .boolean()
        .default(false)
        .describe(
            "Include issue comments in the same response to avoid a separate read-comments call (default: false)",
        ),
    commentsLimit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            "Maximum number of latest comments to include when includeComments=true (shows total and skipped counts; when omitted on paginated issues, tail fetch is capped at the latest 50 comments)",
        ),
};

export const readDescriptionHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({
        issueKey,
        includeComments = false,
        commentsLimit,
    }: {
        issueKey: string;
        includeComments?: boolean;
        commentsLimit?: number;
    }) => {
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

        if (
            commentsLimit !== undefined &&
            (!Number.isInteger(commentsLimit) || commentsLimit < 1)
        ) {
            return {
                content: [
                    {
                        type: "text",
                        text: `commentsLimit must be a positive integer (got ${commentsLimit}).`,
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

        try {
            const requestedFields = includeComments
                ? [...ISSUE_DESCRIPTION_FIELDS, "comment"]
                : [...ISSUE_DESCRIPTION_FIELDS];

            const issue = await jira.issues.getIssue({
                issueIdOrKey: resolvedIssueKey,
                expand: ["parent", "subtasks", "issuelinks"],
                fields: requestedFields,
            });

            if (!issue) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Issue ${resolvedIssueKey} not found`,
                        },
                    ],
                };
            }

            const issueStructure = await getIssueStructure(
                jira,
                resolvedIssueKey,
                jiraConfig.host,
                issue,
            );

            const formattedDescription = formatIssueDescription(issue as any);
            const formattedStructure = formatIssueStructure(issueStructure);

            const sections = [formattedDescription, formattedStructure];

            if (includeComments) {
                try {
                    const embeddedComments = (issue as any).fields?.comment as
                        | EmbeddedCommentPage
                        | undefined;
                    const { comments, total } = await fetchIssueComments(
                        jira,
                        resolvedIssueKey,
                        commentsLimit,
                        embeddedComments,
                    );
                    sections.push(
                        formatComments(resolvedIssueKey, comments, {
                            total,
                            limit: commentsLimit,
                        }),
                    );
                } catch (commentError) {
                    console.error(
                        "Error fetching Jira comments in read-description:",
                        commentError,
                    );
                    sections.push(
                        `Comments for ${resolvedIssueKey}:\nFailed to retrieve comments: ${formatJiraError(
                            commentError,
                        )}`,
                    );
                }
            } else if (commentsLimit !== undefined) {
                sections.push(
                    `Note: commentsLimit=${commentsLimit} was ignored because includeComments=false. Pass includeComments=true to include comments.`,
                );
            }

            return {
                content: [
                    {
                        type: "text",
                        text: sections.join("\n\n"),
                    },
                ],
            };
        } catch (error) {
            console.error("Error fetching Jira issue:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve issue ${resolvedIssueKey}: ${formatJiraError(
                            error,
                        )}`,
                    },
                ],
            };
        }
    };
