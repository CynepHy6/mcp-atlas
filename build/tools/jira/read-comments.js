import { z } from "zod";
import { formatComments } from "../../utils/formatters.js";
import { extractIssueKey, formatJiraError, } from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const DEFAULT_PAGINATED_COMMENTS_CAP = 50;
export async function fetchIssueComments(jira, issueKey, limit, initialPage) {
    const firstPage = initialPage && Array.isArray(initialPage.comments)
        ? initialPage
        : await jira.issueComments.getComments({
            issueIdOrKey: issueKey,
        });
    const firstComments = (firstPage?.comments ?? []);
    const startAt = typeof firstPage?.startAt === "number" ? firstPage.startAt : 0;
    const total = typeof firstPage?.total === "number"
        ? Math.max(firstPage.total, startAt + firstComments.length)
        : startAt + firstComments.length;
    if (total === 0 || (firstComments.length === 0 && startAt >= total)) {
        return { comments: [], total: 0 };
    }
    if (startAt + firstComments.length >= total) {
        const selected = limit !== undefined ? firstComments.slice(-limit) : firstComments;
        return { comments: selected, total };
    }
    const effectiveTailLimit = limit ?? Math.max(firstComments.length, DEFAULT_PAGINATED_COMMENTS_CAP);
    const desiredStart = Math.max(0, total - effectiveTailLimit);
    const collected = [];
    let nextStart = desiredStart;
    if (desiredStart < startAt + firstComments.length) {
        const localSliceStart = Math.max(0, desiredStart - startAt);
        collected.push(...firstComments.slice(localSliceStart));
        nextStart = startAt + firstComments.length;
    }
    while (collected.length < effectiveTailLimit && nextStart < total) {
        const remaining = Math.min(effectiveTailLimit - collected.length, total - nextStart);
        const page = await jira.issueComments.getComments({
            issueIdOrKey: issueKey,
            startAt: nextStart,
            maxResults: remaining,
        });
        const batch = (page?.comments ?? []);
        if (batch.length === 0) {
            break;
        }
        collected.push(...batch);
        nextStart += batch.length;
    }
    return {
        comments: collected.slice(-effectiveTailLimit),
        total: Math.max(total, collected.length),
    };
}
export const readCommentsSchema = {
    issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJECT-123) or browse URL"),
    limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Maximum number of latest comments to return (optional; shows total and skipped counts; when omitted on paginated issues, tail fetch is capped at the latest 50 comments — pass a larger limit to fetch more)"),
};
export const readCommentsHandler = (jira, jiraConfig) => async ({ issueKey, limit }) => {
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
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        return {
            content: [
                {
                    type: "text",
                    text: `limit must be a positive integer (got ${limit}).`,
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
        const { comments, total } = await fetchIssueComments(jira, resolvedIssueKey, limit);
        if (comments.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No comments found for issue ${resolvedIssueKey}`,
                    },
                ],
            };
        }
        const commentsText = formatComments(resolvedIssueKey, comments, {
            total,
            limit,
        });
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
                    text: `Failed to retrieve comments for ${resolvedIssueKey}: ${formatJiraError(error)}`,
                },
            ],
        };
    }
};
