import { z } from "zod";
import { buildIssueBrowseUrl, buildIssueUpdateFields, extractIssueKey, formatJiraError, isSubtaskType, } from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const createIssueSchema = {
    projectKey: z
        .string()
        .describe('Jira project key, e.g. "PROJ"'),
    issueType: z
        .string()
        .describe('Issue type name as shown in Jira, e.g. "Task", "Bug", "Story", "Sub-task"'),
    summary: z.string().describe("Issue summary / title"),
    description: z
        .string()
        .optional()
        .describe("Issue description in Jira wiki markup (h2., *bold*, {{code}}, * lists). Not Markdown."),
    parentKey: z
        .string()
        .optional()
        .describe("Parent issue key or browse URL. Required for Sub-task. Also used to nest under an epic/parent when the project accepts fields.parent."),
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
        .describe("Extra Jira fields by id or name, e.g. { customfield_12345: \"value\" }. Explicit tool arguments override keys here."),
};
export const createIssueHandler = (jira, jiraConfig) => async ({ projectKey, issueType, summary, description, parentKey, assignee, priority, labels, components, dueDate, additionalFields, }) => {
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
    else if (isSubtaskType(issueType)) {
        return {
            content: [
                {
                    type: "text",
                    text: `parentKey is required when issueType is "${issueType}"`,
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
        labels,
        components,
        dueDate,
        additionalFields,
    });
    fields.project = { key: projectKey };
    try {
        const created = await jira.issues.createIssue({
            fields: fields,
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
    }
    catch (error) {
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
