import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { z } from "zod";
import { validateJiraConfig } from "../../utils/validation.js";
export const downloadAttachmentSchema = {
    attachmentId: z
        .string()
        .optional()
        .describe("Numeric Jira attachment id (preferred). Get it from list-attachments."),
    issueKey: z
        .string()
        .optional()
        .describe("Issue key (e.g., PROJECT-123). Required when attachmentId is unknown; used together with filename to resolve the attachment."),
    filename: z
        .string()
        .optional()
        .describe("Attachment filename to download. Used with issueKey when attachmentId is unknown. If multiple attachments share the name, the first match is downloaded."),
    saveDir: z
        .string()
        .optional()
        .describe("Directory to save the file in. Defaults to the current working directory of the MCP server. Created recursively if missing."),
    overwrite: z
        .boolean()
        .default(false)
        .describe("Overwrite an existing file with the same name (default: false)."),
};
function sanitizeFilename(name) {
    const base = path.basename(name);
    // Strip path separators and NUL bytes; keep the rest as-is to preserve extensions.
    const cleaned = base.replace(/[/\\]/g, "_").replace(/\0/g, "");
    // Reject traversal / placeholder names so path.join cannot escape targetDir.
    if (!cleaned || cleaned === "." || cleaned === "..") {
        return "attachment";
    }
    return cleaned;
}
function formatBytes(bytes) {
    if (!bytes)
        return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function buildAuthHeaders(config) {
    const headers = {
        Accept: "application/json",
    };
    if (config.apiToken) {
        if (config.host.includes("skyeng.link")) {
            // Jira Server/Data Center — PAT as Bearer.
            headers.Authorization = `Bearer ${config.apiToken}`;
        }
        else {
            // Atlassian Cloud — Basic with email + API token.
            const authString = Buffer.from(`${config.username}:${config.apiToken}`).toString("base64");
            headers.Authorization = `Basic ${authString}`;
        }
    }
    else if (config.password) {
        const authString = Buffer.from(`${config.username}:${config.password}`).toString("base64");
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
function resolveHost(config) {
    let host = config.host;
    if (host.includes("://")) {
        host = new URL(host).href.replace(/\/$/, "");
    }
    else {
        host = `https://${host}`;
    }
    return host;
}
async function resolveByIssueAndFilename(jira, issueKey, filename) {
    const issue = await jira.issues.getIssue({
        issueIdOrKey: issueKey,
        fields: ["attachment"],
    });
    const rawAttachments = issue?.fields?.attachment ?? [];
    const match = rawAttachments.find((a) => a.filename === filename);
    if (!match) {
        const available = rawAttachments
            .map((a) => `- ${a.filename}`)
            .join("\n");
        throw new Error(`Attachment "${filename}" not found on ${issueKey}.${available ? ` Available:\n${available}` : ""}`);
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
async function resolveById(config, attachmentId) {
    const host = resolveHost(config);
    const meta = await axios.get(`${host}/rest/api/2/attachment/${attachmentId}`, { headers: buildAuthHeaders(config), timeout: 15000 });
    return {
        id: String(meta.data.id ?? attachmentId),
        filename: meta.data.filename ?? `attachment-${attachmentId}`,
        mimeType: meta.data.mimeType ??
            meta.data.content_type ??
            "application/octet-stream",
        size: Number(meta.data.size ?? 0),
        created: meta.data.created ?? "",
        contentUrl: meta.data.content ?? "",
    };
}
async function downloadContent(config, attachmentId, contentUrl) {
    const host = resolveHost(config);
    const authHeaders = buildAuthHeaders(config);
    // REST endpoint first — Bearer auth works on /rest/api/2/* (no gandalf gate).
    // Web URL /secure/attachment/... is gandalf-blocked for Bearer tokens.
    try {
        const restResponse = await axios.get(`${host}/rest/api/2/attachment/content/${attachmentId}`, {
            headers: authHeaders,
            responseType: "arraybuffer",
            timeout: 60000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            // Ask Jira to stream content directly instead of 302-redirecting
            // to the /secure/attachment web URL (which gandalf blocks).
            params: { redirect: true },
        });
        return Buffer.from(restResponse.data);
    }
    catch (restError) {
        const restStatus = restError?.response?.status;
        // Fall back to the web contentUrl only if REST endpoint is unavailable (404/405).
        // For 401/403 we surface immediately — auth issue, not endpoint shape.
        if (restStatus === 401 || restStatus === 403) {
            throw new Error(`REST attachment content endpoint returned ${restStatus}: ${restError?.message ?? ""}`);
        }
        // Fall through to web URL attempt.
        console.error(`REST /rest/api/2/attachment/content/${attachmentId} failed (${restStatus ?? restError?.message}); falling back to web contentUrl`);
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
    if (/<!DOCTYPE html|<html/i.test(sample) &&
        /Доступ ограничен|gandalf|<title>|openresty|yabrowser/i.test(sample)) {
        throw new Error(`Attachment binary is not reachable with Bearer/PAT auth on this Jira deployment. ` +
            `REST content endpoint is unavailable and the web URL is gated by SSO (Yandex Browser). ` +
            `Open the URL in a Yandex Browser session to download: ${contentUrl}`);
    }
    return buf;
}
export const downloadAttachmentHandler = (jira, jiraConfig) => async ({ attachmentId, issueKey, filename, saveDir, overwrite, }) => {
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
        let resolved;
        if (attachmentId) {
            resolved = await resolveById(jiraConfig, attachmentId);
        }
        else {
            resolved = await resolveByIssueAndFilename(jira, issueKey, filename);
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
        const buffer = await downloadContent(jiraConfig, resolved.id, resolved.contentUrl);
        fs.writeFileSync(targetPath, buffer);
        const lines = [
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
    }
    catch (error) {
        console.error("Error downloading attachment:", error);
        const msg = error?.response?.status
            ? `HTTP ${error.response.status} ${error.response.statusText ?? ""}: ${error.message}`
            : error.message;
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
