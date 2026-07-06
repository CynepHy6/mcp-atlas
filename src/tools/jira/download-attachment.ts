import * as fs from "fs";
import * as path from "path";
import { Version2Client } from "jira.js/version2";
import { z } from "zod";
import { JiraConfig } from "../../clients/jira-client.js";
import { validateJiraConfig } from "../../utils/validation.js";

export const downloadAttachmentSchema = {
    attachmentId: z
        .string()
        .optional()
        .describe(
            "Numeric Jira attachment id (preferred). Get it from list-attachments."
        ),
    issueKey: z
        .string()
        .optional()
        .describe(
            "Issue key (e.g., PROJECT-123). Required when attachmentId is unknown; used together with filename to resolve the attachment."
        ),
    filename: z
        .string()
        .optional()
        .describe(
            "Attachment filename to download. Used with issueKey when attachmentId is unknown. If multiple attachments share the name, the first match is downloaded."
        ),
    saveDir: z
        .string()
        .optional()
        .describe(
            "Directory to save the file in. Defaults to the current working directory of the MCP server. Created recursively if missing."
        ),
    overwrite: z
        .boolean()
        .default(false)
        .describe(
            "Overwrite an existing file with the same name (default: false)."
        ),
};

interface ResolvedAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    created: string;
    contentUrl: string;
}

function sanitizeFilename(name: string): string {
    const base = path.basename(name);
    // Strip path separators and NUL bytes; keep the rest as-is to preserve extensions.
    const cleaned = base.replace(/[/\\]/g, "_").replace(/\0/g, "");
    // Reject traversal / placeholder names so path.join cannot escape targetDir.
    if (!cleaned || cleaned === "." || cleaned === "..") {
        return "attachment";
    }
    return cleaned;
}

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function resolveByIssueAndFilename(
    jira: Version2Client,
    issueKey: string,
    filename: string
): Promise<ResolvedAttachment> {
    const issue = await jira.issues.getIssue({
        issueIdOrKey: issueKey,
        fields: ["attachment"],
    });

    const rawAttachments = (issue as any)?.fields?.attachment ?? [];
    const match = rawAttachments.find(
        (a: any) => a.filename === filename
    );

    if (!match) {
        const available = rawAttachments
            .map((a: any) => `- ${a.filename}`)
            .join("\n");
        throw new Error(
            `Attachment "${filename}" not found on ${issueKey}.${
                available ? ` Available:\n${available}` : ""
            }`
        );
    }

    return {
        id: String(match.id),
        filename: match.filename,
        mimeType: match.mimeType ?? "application/octet-stream",
        size: Number(match.size ?? 0),
        created: match.created ?? "",
        contentUrl: match.content ?? "",
    };
}

async function resolveById(
    jira: Version2Client,
    attachmentId: string
): Promise<ResolvedAttachment> {
    const meta: any = await jira.issueAttachments.getAttachment({
        id: attachmentId,
    });
    return {
        id: String(meta.id ?? attachmentId),
        filename: meta.filename ?? `attachment-${attachmentId}`,
        mimeType: meta.mimeType ?? meta.content_type ?? "application/octet-stream",
        size: Number(meta.size ?? 0),
        created: meta.created ?? "",
        contentUrl: meta.content ?? "",
    };
}

export const downloadAttachmentHandler =
    (jira: Version2Client, jiraConfig: JiraConfig) =>
    async ({
        attachmentId,
        issueKey,
        filename,
        saveDir,
        overwrite,
    }: {
        attachmentId?: string;
        issueKey?: string;
        filename?: string;
        saveDir?: string;
        overwrite: boolean;
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

        if (!attachmentId && !(issueKey && filename)) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Provide either attachmentId, or issueKey + filename to identify the attachment.",
                    },
                ],
            };
        }

        try {
            let resolved: ResolvedAttachment;
            if (attachmentId) {
                resolved = await resolveById(jira, attachmentId);
            } else {
                resolved = await resolveByIssueAndFilename(
                    jira,
                    issueKey!,
                    filename!
                );
            }

            const targetDir = saveDir
                ? path.resolve(saveDir)
                : process.cwd();

            fs.mkdirSync(targetDir, { recursive: true });

            const safeName = sanitizeFilename(resolved.filename);
            const targetPath = path.join(targetDir, safeName);

            if (!overwrite && fs.existsSync(targetPath)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `File already exists: ${targetPath}. Set overwrite=true to replace it.`,
                        },
                    ],
                };
            }

            const content: ArrayBuffer = await jira.issueAttachments.getAttachmentContent(
                { id: resolved.id }
            );

            const buffer = Buffer.from(content);
            fs.writeFileSync(targetPath, buffer);

            const lines: string[] = [
                `Attachment saved: ${targetPath}`,
                "",
                `id: ${resolved.id}`,
                `filename: ${resolved.filename}`,
                `mimeType: ${resolved.mimeType}`,
                `size: ${formatBytes(buffer.length)} (${buffer.length} bytes on disk)`,
                `sourceUrl: ${resolved.contentUrl}`,
            ];

            return {
                content: [
                    {
                        type: "text",
                        text: lines.join("\n"),
                    },
                ],
            };
        } catch (error) {
            console.error("Error downloading attachment:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to download attachment: ${
                            (error as Error).message
                        }`,
                    },
                ],
            };
        }
    };
