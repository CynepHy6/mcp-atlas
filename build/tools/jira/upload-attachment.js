import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { buildIssueBrowseUrl, extractIssueKey, formatJiraError, } from "../../utils/jira-issue.js";
import { validateJiraConfig } from "../../utils/validation.js";
/** Stop before reading a huge file into memory. Jira may allow less; it still rejects over its own limit. */
export const UPLOAD_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const uploadAttachmentSchema = {
    issueKey: z
        .string()
        .describe("Issue key or browse URL, e.g. PROJ-123"),
    filePath: z
        .string()
        .describe("Path to a local file to attach. Relative paths resolve from the MCP server working directory."),
    filename: z
        .string()
        .optional()
        .describe("Name stored on the issue. Defaults to the local file name."),
};
function textResult(text) {
    return {
        content: [
            {
                type: "text",
                text,
            },
        ],
    };
}
function formatBytes(bytes) {
    if (!bytes)
        return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
export function oversizedFileMessage(size, absolutePath) {
    if (size <= UPLOAD_ATTACHMENT_MAX_BYTES) {
        return null;
    }
    return `File is ${formatBytes(size)} (${size} bytes), above the ${formatBytes(UPLOAD_ATTACHMENT_MAX_BYTES)} upload limit: ${absolutePath}`;
}
function attachmentName(filePath, override) {
    const raw = (override?.trim() || path.basename(filePath)).replace(/\0/g, "");
    const base = path.basename(raw).replace(/[/\\]/g, "_");
    if (!base || base === "." || base === "..") {
        return "attachment";
    }
    return base;
}
/** Jira wiki thumbnail. `|` and `!` inside the name would break the markup. */
export function thumbnailWiki(filename) {
    if (/[!|\r\n]/.test(filename)) {
        return null;
    }
    return `!${filename}|thumbnail!`;
}
function firstUploaded(created, storedName) {
    const items = Array.isArray(created) ? created : [created];
    const objects = items.filter((item) => typeof item === "object" && item !== null);
    if (objects.length === 0) {
        return null;
    }
    return (objects.find((item) => item.filename === storedName) ?? objects[0]);
}
export const uploadAttachmentHandler = (jira, jiraConfig) => async ({ issueKey, filePath, filename, }) => {
    const configError = validateJiraConfig(jiraConfig);
    if (configError) {
        return textResult(`Configuration error: ${configError}`);
    }
    const resolvedIssueKey = extractIssueKey(issueKey);
    if (!resolvedIssueKey) {
        return textResult(`Cannot extract issue key from issueKey: ${issueKey}`);
    }
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
        return textResult("filePath is required.");
    }
    const absolutePath = path.resolve(trimmedPath);
    let stat;
    try {
        stat = fs.statSync(absolutePath);
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT") {
            return textResult(`File not found: ${absolutePath}`);
        }
        return textResult(`Cannot read file ${absolutePath}: ${error.message}`);
    }
    if (!stat.isFile()) {
        return textResult(`Not a file: ${absolutePath}`);
    }
    const oversized = oversizedFileMessage(stat.size, absolutePath);
    if (oversized) {
        return textResult(oversized);
    }
    const storedName = attachmentName(absolutePath, filename);
    try {
        const buffer = fs.readFileSync(absolutePath);
        const created = await jira.issueAttachments.addAttachment({
            issueIdOrKey: resolvedIssueKey,
            attachment: {
                filename: storedName,
                file: buffer,
            },
        });
        const uploaded = firstUploaded(created, storedName);
        if (!uploaded) {
            return textResult(`Jira accepted the request for ${resolvedIssueKey} but returned no attachment metadata.`);
        }
        const name = uploaded.filename ?? storedName;
        const lines = [
            "Attachment uploaded",
            `Issue: ${resolvedIssueKey}`,
            `URL: ${buildIssueBrowseUrl(jiraConfig.host, resolvedIssueKey)}`,
        ];
        if (uploaded.id) {
            lines.push(`id: ${uploaded.id}`);
        }
        lines.push(`filename: ${name}`);
        if (uploaded.mimeType) {
            lines.push(`mimeType: ${uploaded.mimeType}`);
        }
        if (typeof uploaded.size === "number") {
            lines.push(`size: ${formatBytes(uploaded.size)} (${uploaded.size} bytes)`);
        }
        const wiki = thumbnailWiki(name);
        lines.push(wiki
            ? `Wiki thumbnail: ${wiki}`
            : `Wiki thumbnail is unavailable: "${name}" contains ! or |.`);
        return textResult(lines.join("\n"));
    }
    catch (error) {
        console.error("Error uploading attachment:", error);
        return textResult(`Failed to upload attachment to ${resolvedIssueKey}: ${formatJiraError(error)}`);
    }
};
