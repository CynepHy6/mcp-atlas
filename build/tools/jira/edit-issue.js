import { z } from "zod";
import { buildIssueBrowseUrl, buildIssueUpdateFields, extractIssueKey, formatJiraError, } from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const editIssueSchema = {
    issueKey: z
        .string()
        .describe("Issue key or browse URL to update, e.g. PROJ-123"),
    summary: z.string().optional().describe("New issue summary / title"),
    description: z
        .string()
        .optional()
        .describe("New description in Jira wiki markup (h2., *bold*, {{code}}, * lists). Not Markdown. Replaces the whole description."),
    issueType: z
        .string()
        .optional()
        .describe('New issue type name as shown in Jira, e.g. "Bug"'),
    parentKey: z
        .string()
        .optional()
        .describe("New parent issue key or browse URL"),
    assignee: z
        .string()
        .optional()
        .describe("New assignee username (Jira Server/DC name), e.g. jdoe"),
    priority: z
        .string()
        .optional()
        .describe('New priority name as shown in Jira, e.g. "Major"'),
    labels: z
        .array(z.string())
        .optional()
        .describe("Replace all labels with this list"),
    components: z
        .array(z.string())
        .optional()
        .describe("Replace all components with these names"),
    dueDate: z
        .string()
        .optional()
        .describe("Due date in YYYY-MM-DD"),
    additionalFields: z
        .record(z.unknown())
        .optional()
        .describe("Extra Jira fields by id or name, e.g. { customfield_12345: \"value\" }. Explicit tool arguments override keys here."),
};
export const editIssueHandler = (jira, jiraConfig) => async ({ issueKey, summary, description, issueType, parentKey, assignee, priority, labels, components, dueDate, additionalFields, }) => {
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
    let parentIssueKey;
    if (parentKey) {
        const extracted = extractIssueKey(parentKey);
        if (!extracted) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Cannot extract issue key from parentKey: ${parentKey}`,
                    },
                ],
            };
        }
        parentIssueKey = extracted;
    }
    const fields = buildIssueUpdateFields({
        summary,
        description,
        issueType,
        parentIssueKey,
        assignee,
        priority,
        labels,
        components,
        dueDate,
        additionalFields,
    });
    if (Object.keys(fields).length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: "Nothing to update: provide at least one of summary, description, issueType, parentKey, assignee, priority, labels, components, dueDate, or additionalFields.",
                },
            ],
        };
    }
    try {
        await jira.issues.editIssue({
            issueIdOrKey: resolvedIssueKey,
            fields: fields,
        });
        const updatedFieldNames = Object.keys(fields).join(", ");
        const resultLines = [
            "Issue updated successfully",
            `Key: ${resolvedIssueKey}`,
            `Updated fields: ${updatedFieldNames}`,
            `URL: ${buildIssueBrowseUrl(jiraConfig.host, resolvedIssueKey)}`,
        ];
        return {
            content: [
                {
                    type: "text",
                    text: resultLines.join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error updating Jira issue:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to update issue ${resolvedIssueKey}: ${formatJiraError(error)}`,
                },
            ],
        };
    }
};
