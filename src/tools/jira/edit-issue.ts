import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import {
    buildIssueBrowseUrl,
    buildIssueUpdateFields,
    buildLabelUpdateOperations,
    extractIssueKey,
    formatJiraError,
    normalizeLabelNames,
    type LabelUpdateOperation,
} from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";

export const editIssueSchema = {
    issueKey: z
        .string()
        .describe("Issue key or browse URL to update, e.g. PROJ-123"),
    summary: z.string().optional().describe("New issue summary / title"),
    description: z
        .string()
        .optional()
        .describe(
            "New description in Jira wiki markup (h2., *bold*, {{code}}, * lists). Not Markdown. Replaces the whole description.",
        ),
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
        .describe(
            "Replace all labels with this list. Empty array clears every label. Do not combine with addLabels or removeLabels.",
        ),
    addLabels: z
        .array(z.string())
        .optional()
        .describe(
            "Add these labels and leave the rest. Does not require the current list.",
        ),
    removeLabels: z
        .array(z.string())
        .optional()
        .describe(
            "Remove these labels and leave the rest. Does not require the current list.",
        ),
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
        .describe(
            "Extra Jira fields by id or name, e.g. { customfield_12345: \"value\" }. Explicit tool arguments override keys here.",
        ),
};

export const editIssueHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({
        issueKey,
        summary,
        description,
        issueType,
        parentKey,
        assignee,
        priority,
        labels,
        addLabels,
        removeLabels,
        components,
        dueDate,
        additionalFields,
    }: {
        issueKey: string;
        summary?: string;
        description?: string;
        issueType?: string;
        parentKey?: string;
        assignee?: string;
        priority?: string;
        labels?: string[];
        addLabels?: string[];
        removeLabels?: string[];
        components?: string[];
        dueDate?: string;
        additionalFields?: Record<string, unknown>;
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

        let parentIssueKey: string | undefined;
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

        const normalizedLabels = normalizeLabelNames("labels", labels);
        if ("error" in normalizedLabels) {
            return {
                content: [{ type: "text", text: normalizedLabels.error }],
            };
        }
        const normalizedAddLabels = normalizeLabelNames("addLabels", addLabels);
        if ("error" in normalizedAddLabels) {
            return {
                content: [{ type: "text", text: normalizedAddLabels.error }],
            };
        }
        const normalizedRemoveLabels = normalizeLabelNames(
            "removeLabels",
            removeLabels,
        );
        if ("error" in normalizedRemoveLabels) {
            return {
                content: [{ type: "text", text: normalizedRemoveLabels.error }],
            };
        }

        const labelOperations = buildLabelUpdateOperations(
            normalizedAddLabels.labels,
            normalizedRemoveLabels.labels,
        );
        if (
            normalizedLabels.labels !== undefined &&
            labelOperations.length > 0
        ) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Pass either labels (replace the whole list) or addLabels/removeLabels, not both.",
                    },
                ],
            };
        }

        const fields = buildIssueUpdateFields({
            summary,
            description,
            issueType,
            parentIssueKey,
            assignee,
            priority,
            labels: normalizedLabels.labels,
            components,
            dueDate,
            additionalFields,
        });

        if (Object.keys(fields).length === 0 && labelOperations.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Nothing to update: provide at least one of summary, description, issueType, parentKey, assignee, priority, labels, addLabels, removeLabels, components, dueDate, or additionalFields.",
                    },
                ],
            };
        }

        try {
            await jira.issues.editIssue({
                issueIdOrKey: resolvedIssueKey,
                ...(Object.keys(fields).length > 0
                    ? { fields: fields as any }
                    : {}),
                ...(labelOperations.length > 0
                    ? { update: { labels: labelOperations } }
                    : {}),
            });

            const updatedFieldNames = [
                ...Object.keys(fields),
                ...(labelOperations.length > 0 ? ["labels"] : []),
            ].join(", ");
            const resultLines = [
                "Issue updated successfully",
                `Key: ${resolvedIssueKey}`,
                `Updated fields: ${updatedFieldNames}`,
                ...formatLabelResultLines(
                    normalizedLabels.labels,
                    labelOperations,
                ),
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
        } catch (error) {
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

function formatLabelResultLines(
    replacedLabels: string[] | undefined,
    operations: LabelUpdateOperation[],
): string[] {
    if (replacedLabels !== undefined) {
        const value = replacedLabels.length > 0 ? replacedLabels.join(", ") : "(none)";
        return [`Labels: ${value}`];
    }

    if (operations.length === 0) {
        return [];
    }

    const added = operations
        .filter((operation): operation is { add: string } => "add" in operation)
        .map((operation) => operation.add);
    const removed = operations
        .filter((operation): operation is { remove: string } => "remove" in operation)
        .map((operation) => operation.remove);
    const parts: string[] = [];
    if (added.length > 0) {
        parts.push(`add ${added.join(", ")}`);
    }
    if (removed.length > 0) {
        parts.push(`remove ${removed.join(", ")}`);
    }

    return [`Labels: ${parts.join("; ")}`];
}
