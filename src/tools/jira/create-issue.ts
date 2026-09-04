import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import { validateJiraConfig } from "../../utils/validation.js";

export const createIssueSchema = {
    projectKey: z
        .string()
        .describe('Jira project key, e.g. "PROJ"'),
    issueType: z
        .string()
        .describe(
            'Issue type name as shown in Jira, e.g. "Task", "Bug", "Story", "Sub-task"',
        ),
    summary: z.string().describe("Issue summary / title"),
    description: z
        .string()
        .optional()
        .describe(
            "Issue description in Jira wiki markup (h2., *bold*, {{code}}, * lists). Not Markdown.",
        ),
    parentKey: z
        .string()
        .optional()
        .describe(
            "Parent issue key or browse URL. Required for Sub-task. Also used to nest under an epic/parent when the project accepts fields.parent.",
        ),
    assignee: z
        .string()
        .optional()
        .describe("Assignee username (Jira Server/DC name), e.g. jdoe"),
    priority: z
        .string()
        .optional()
        .describe('Priority name as shown in Jira, e.g. "Major"'),
    labels: z
        .array(z.string())
        .optional()
        .describe("Labels to set on the new issue"),
    components: z
        .array(z.string())
        .optional()
        .describe("Component names as shown in the project"),
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

const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]+-\d+$/;
const BROWSE_KEY_RE = /\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)/;

export function extractIssueKey(keyOrUrl: string): string | null {
    const trimmed = keyOrUrl.trim();
    if (!trimmed) {
        return null;
    }

    const browseMatch = trimmed.match(BROWSE_KEY_RE);
    if (browseMatch) {
        return browseMatch[1].toUpperCase();
    }

    if (ISSUE_KEY_RE.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    return null;
}

export function isSubtaskType(issueType: string): boolean {
    const normalized = issueType.trim().toLowerCase();
    return (
        normalized === "sub-task" ||
        normalized === "subtask" ||
        normalized.includes("подзадач")
    );
}

export function buildIssueBrowseUrl(host: string, issueKey: string): string {
    const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${cleanHost}/browse/${issueKey}`;
}

export function formatJiraError(error: unknown): string {
    const err = error as {
        message?: string;
        status?: number;
        response?: unknown;
    };

    const response = err.response;
    const payload = unwrapJiraErrorPayload(response);

    const parts: string[] = [];
    if (payload.errorMessages?.length) {
        parts.push(...payload.errorMessages);
    }
    if (payload.errors) {
        for (const [field, message] of Object.entries(payload.errors)) {
            parts.push(`${field}: ${message}`);
        }
    }

    if (parts.length > 0) {
        const status =
            err.status ??
            (isRecord(response) && typeof response.status === "number"
                ? response.status
                : undefined);
        return status
            ? `HTTP ${status}: ${parts.join("; ")}`
            : parts.join("; ");
    }

    if (payload.message) {
        return payload.message;
    }

    return err.message || "Unknown error";
}

function unwrapJiraErrorPayload(response: unknown): {
    errorMessages?: string[];
    errors?: Record<string, string>;
    message?: string;
} {
    if (!isRecord(response)) {
        return {};
    }

    if (isRecord(response.data)) {
        return response.data as {
            errorMessages?: string[];
            errors?: Record<string, string>;
            message?: string;
        };
    }

    return response as {
        errorMessages?: string[];
        errors?: Record<string, string>;
        message?: string;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export const createIssueHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({
        projectKey,
        issueType,
        summary,
        description,
        parentKey,
        assignee,
        priority,
        labels,
        components,
        dueDate,
        additionalFields,
    }: {
        projectKey: string;
        issueType: string;
        summary: string;
        description?: string;
        parentKey?: string;
        assignee?: string;
        priority?: string;
        labels?: string[];
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
        } else if (isSubtaskType(issueType)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `parentKey is required when issueType is "${issueType}"`,
                    },
                ],
            };
        }

        const fields: Record<string, unknown> = {
            ...(additionalFields ?? {}),
            project: { key: projectKey },
            issuetype: { name: issueType },
            summary,
        };

        if (description !== undefined) {
            fields.description = description;
        }
        if (parentIssueKey) {
            fields.parent = { key: parentIssueKey };
        }
        if (assignee) {
            fields.assignee = { name: assignee };
        }
        if (priority) {
            fields.priority = { name: priority };
        }
        if (labels) {
            fields.labels = labels;
        }
        if (components) {
            fields.components = components.map((name) => ({ name }));
        }
        if (dueDate) {
            fields.duedate = dueDate;
        }

        try {
            const created = await jira.issues.createIssue({
                fields: fields as any,
            });

            if (!created?.key) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Failed to create issue: Jira did not return an issue key",
                        },
                    ],
                };
            }

            const resultLines = [
                "Issue created successfully",
                `Key: ${created.key}`,
                `ID: ${created.id}`,
                `Project: ${projectKey}`,
                `Type: ${issueType}`,
                `Summary: ${summary}`,
                `URL: ${buildIssueBrowseUrl(jiraConfig.host, created.key)}`,
            ];

            if (parentIssueKey) {
                resultLines.push(`Parent: ${parentIssueKey}`);
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
            console.error("Error creating Jira issue:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to create issue: ${formatJiraError(error)}`,
                    },
                ],
            };
        }
    };
