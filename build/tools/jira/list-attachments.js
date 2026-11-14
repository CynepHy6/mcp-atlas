import { z } from "zod";
import { validateJiraConfig } from "../../utils/validation.js";
export const listAttachmentsSchema = {
    issueKey: z.string().describe("The Jira issue key (e.g., PROJECT-123)"),
};
function formatBytes(bytes) {
    if (!bytes)
        return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatAttachments(issueKey, attachments) {
    if (attachments.length === 0) {
        return `Issue ${issueKey} has no attachments.`;
    }
    const lines = [
        `Attachments for ${issueKey} (${attachments.length}):`,
        "",
    ];
    for (const a of attachments) {
        lines.push(`- id: ${a.id}`);
        lines.push(`  filename: ${a.filename}`);
        lines.push(`  mimeType: ${a.mimeType}`);
        lines.push(`  size: ${formatBytes(a.size)} (${a.size} bytes)`);
        lines.push(`  created: ${a.created}`);
        if (a.author)
            lines.push(`  author: ${a.author}`);
        lines.push(`  contentUrl: ${a.contentUrl}`);
        if (a.thumbnailUrl)
            lines.push(`  thumbnailUrl: ${a.thumbnailUrl}`);
        lines.push("");
    }
    lines.push("Use download-attachment with attachmentId (preferred) or issueKey + filename to save a file to disk.");
    return lines.join("\n");
}
export const listAttachmentsHandler = (jira, jiraConfig) => async ({ issueKey }) => {
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
        const issue = await jira.issues.getIssue({
            issueIdOrKey: issueKey,
            fields: ["attachment"],
        });
        const rawAttachments = issue?.fields?.attachment ?? [];
        const attachments = rawAttachments.map((a) => ({
            id: String(a.id),
            filename: a.filename,
            mimeType: a.mimeType ?? a.content_type ?? "application/octet-stream",
            size: Number(a.size ?? 0),
            created: a.created ?? "",
            author: a.author?.displayName ?? a.author?.name ?? "",
            contentUrl: a.content ?? "",
            thumbnailUrl: a.thumbnail ?? undefined,
        }));
        return {
            content: [
                {
                    type: "text",
                    text: formatAttachments(issueKey, attachments),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error listing attachments:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to list attachments for ${issueKey}: ${error.message}`,
                },
            ],
        };
    }
};
