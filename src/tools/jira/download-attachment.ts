import * as fs from "fs";
import * as path from "path";
import axios from "axios";
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

function buildAuthHeaders(config: JiraConfig): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    if (config.apiToken) {
        if (config.host.includes("skyeng.link")) {
            // Jira Server/Data Center — PAT as Bearer.
            headers.Authorization = `Bearer ${config.apiToken}`;
        } else {
            // Atlassian Cloud — Basic with email + API token.
            const authString = Buffer.from(
                `${config.username}:${config.apiToken}`
            ).toString("base64");
            headers.Authorization = `Basic ${authString}`;
        }
    } else if (config.password) {
        const authString = Buffer.from(
            `${config.username}:${config.password}`
        ).toString("base64");
        headers.Authorization = `Basic ${authString}`;
    }
    // Optional custom header for reverse-proxy/SSO gates (e.g. gandalf on Skyeng
    // Jira blocks /secure/attachment/* and redirects to Yandex Browser SSO even
    // with Bearer; a corporate bypass header set via JIRA_CUSTOM_HEADER lets the
    // request through). Format: "Header-Name: value". Nothing is added if the env
    // var is not set, so the tool stays deployment-agnostic.
    const customHeader = process.env.JIRA_CUSTOM_HEADER;
    if (customHeader) {
        const idx = customHeader.indexOf(":");
        if (idx > 0) {
            const name = customHeader.slice(0, idx).trim();
            const value = customHeader.slice(idx + 1).trim();
            if (name && value) {
                headers[name] = value;
            }
        }
    }
    return headers;
}

function resolveHost(config: JiraConfig): string {
    let host = config.host;
    if (host.includes("://")) {
        host = new URL(host).href.replace(/\/$/, "");
    } else {
        host = `https://${host}`;
    }
    return host;
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
    const match = rawAttachments.find((a: any) => a.filename === filename);

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
    config: JiraConfig,
    attachmentId: string
): Promise<ResolvedAttachment> {
    const host = resolveHost(config);
    const meta: any = await axios.get(
        `${host}/rest/api/2/attachment/${attachmentId}`,
        { headers: buildAuthHeaders(config), timeout: 15000 }
    );
    return {
        id: String(meta.data.id ?? attachmentId),
        filename: meta.data.filename ?? `attachment-${attachmentId}`,
        mimeType:
            meta.data.mimeType ??
            meta.data.content_type ??
            "application/octet-stream",
        size: Number(meta.data.size ?? 0),
        created: meta.data.created ?? "",
        contentUrl: meta.data.content ?? "",
    };
}

async function downloadContent(
    config: JiraConfig,
    attachmentId: string,
    contentUrl: string
): Promise<Buffer> {
    const host = resolveHost(config);
    const authHeaders = buildAuthHeaders(config);

    // REST endpoint first — Bearer auth works on /rest/api/2/* (no gandalf gate).
    // Web URL /secure/attachment/... is gandalf-blocked for Bearer tokens.
    try {
        const restResponse = await axios.get(
            `${host}/rest/api/2/attachment/content/${attachmentId}`,
            {
                headers: authHeaders,
                responseType: "arraybuffer",
                timeout: 60000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                // Ask Jira to stream content directly instead of 302-redirecting
                // to the /secure/attachment web URL (which gandalf blocks).
                params: { redirect: true },
            }
        );
        return Buffer.from(restResponse.data);
    } catch (restError: any) {
        const restStatus = restError?.response?.status;
        // Fall back to the web contentUrl only if REST endpoint is unavailable (404/405).
        // For 401/403 we surface immediately — auth issue, not endpoint shape.
        if (restStatus === 401 || restStatus === 403) {
            throw new Error(
                `REST attachment content endpoint returned ${restStatus}: ${
                    restError?.message ?? ""
                }`
            );
        }
        // Fall through to web URL attempt.
        console.error(
            `REST /rest/api/2/attachment/content/${attachmentId} failed (${restStatus ?? restError?.message}); falling back to web contentUrl`
        );
    }

    const webResponse = await axios.get(contentUrl, {
        headers: authHeaders,
        responseType: "arraybuffer",
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });
    const buf = Buffer.from(webResponse.data);

    // Detect gandalf/SSO HTML gate — axios returns 200 with HTML body instead of the binary.
    const sample = buf.subarray(0, 200).toString("utf8");
    if (
        /<!DOCTYPE html|<html/i.test(sample) &&
        /Доступ ограничен|gandalf|<title>|openresty|yabrowser/i.test(sample)
    ) {
        throw new Error(
            `Attachment binary is not reachable with Bearer/PAT auth on this Jira deployment. ` +
                `REST content endpoint is unavailable and the web URL is gated by SSO (Yandex Browser). ` +
                `Open the URL in a Yandex Browser session to download: ${contentUrl}`
        );
    }
    return buf;
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
                resolved = await resolveById(jiraConfig, attachmentId);
            } else {
                resolved = await resolveByIssueAndFilename(
                    jira,
                    issueKey!,
                    filename!
                );
            }

            if (!resolved.contentUrl) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Attachment ${resolved.id} has no content URL. Cannot download.`,
                        },
                    ],
                };
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

            const buffer = await downloadContent(
                jiraConfig,
                resolved.id,
                resolved.contentUrl
            );
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
            const msg = (error as any)?.response?.status
                ? `HTTP ${(error as any).response.status} ${(error as any).response.statusText ?? ""}: ${
                      (error as Error).message
                  }`
                : (error as Error).message;
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to download attachment: ${msg}`,
                    },
                ],
            };
        }
    };
