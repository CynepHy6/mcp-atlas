import { z } from "zod";
import { validateConfluenceConfig } from "../../utils/validation.js";
const normalizeConfluenceHost = (host) => host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
const formatCreatedAt = (page) => {
    const createdAt = page.history?.createdDate || page.version?.when;
    if (!createdAt) {
        return "Unknown";
    }
    const parsedDate = new Date(createdAt);
    return Number.isNaN(parsedDate.getTime())
        ? "Unknown"
        : parsedDate.toLocaleString();
};
const extractPageId = (pageIdOrUrl) => {
    if (!pageIdOrUrl.includes("/")) {
        return pageIdOrUrl;
    }
    const pageIdMatch = pageIdOrUrl.match(/[?&]pageId=(\d+)/);
    if (pageIdMatch) {
        return pageIdMatch[1];
    }
    const urlParts = pageIdOrUrl.split("/");
    const pageIndex = urlParts.findIndex((part) => part === "pages");
    if (pageIndex >= 0 && pageIndex < urlParts.length - 1) {
        return urlParts[pageIndex + 1];
    }
    return null;
};
const formatCommentAuthor = (comment) => comment.history?.createdBy?.displayName ||
    comment.version?.by?.displayName ||
    comment.history?.createdBy?.username ||
    comment.version?.by?.username ||
    comment.history?.createdBy?.email ||
    comment.version?.by?.email ||
    "Unknown";
const formatCommentDate = (comment) => {
    const createdAt = comment.history?.createdDate || comment.version?.when;
    if (!createdAt) {
        return "Unknown";
    }
    const parsedDate = new Date(createdAt);
    return Number.isNaN(parsedDate.getTime())
        ? "Unknown"
        : parsedDate.toLocaleString();
};
const formatCommentUrl = (comment, confluenceConfig) => {
    const webui = comment._links?.webui;
    if (!webui) {
        return null;
    }
    const baseUrl = comment._links?.base || normalizeConfluenceHost(confluenceConfig.host);
    return `${baseUrl}${webui}`;
};
const formatConfluenceComments = (comments, confluenceConfig) => {
    if (comments.length === 0) {
        return "Comments:\nNo comments found.";
    }
    const commentBlocks = comments.map((comment, index) => {
        const commentLines = [
            `${index + 1}. Author: ${formatCommentAuthor(comment)}`,
            `   Date: ${formatCommentDate(comment)}`,
            `   Type: ${comment.type || "comment"}`,
        ];
        if (comment.extensions?.location) {
            commentLines.push(`   Location: ${comment.extensions.location}`);
        }
        if (comment.status) {
            commentLines.push(`   Status: ${comment.status}`);
        }
        if (comment.extensions?.resolution?.status) {
            commentLines.push(`   Resolution: ${comment.extensions.resolution.status}`);
        }
        if (comment.extensions?.inlineProperties?.textSelection) {
            commentLines.push(`   Selected text: ${comment.extensions.inlineProperties.textSelection}`);
        }
        const commentUrl = formatCommentUrl(comment, confluenceConfig);
        if (commentUrl) {
            commentLines.push(`   URL: ${commentUrl}`);
        }
        commentLines.push(`   Comment:\n${comment.body?.storage?.value || "No content"}`);
        return commentLines.join("\n");
    });
    return `Comments (${comments.length}):\n\n${commentBlocks.join("\n\n")}`;
};
const getCommentsExpand = () => [
    "body.storage",
    "history",
    "version",
    "extensions.resolution",
    "extensions.inlineProperties",
].join(",");
const fetchAllComments = async (confluence, pageId) => {
    const comments = [];
    const commentsExpand = getCommentsExpand();
    let startIndex = 0;
    const pageSize = 100;
    while (true) {
        const response = await confluence.get(`/content/${pageId}/child/comment`, {
            params: {
                expand: commentsExpand,
                limit: pageSize,
                start: startIndex,
            },
        });
        const fetchedComments = response.data.results || [];
        comments.push(...fetchedComments);
        if (fetchedComments.length === 0 ||
            fetchedComments.length < pageSize ||
            !response.data._links?.next) {
            return comments;
        }
        startIndex += fetchedComments.length;
    }
};
const getCommentsSection = async (confluence, confluenceConfig, pageId) => {
    try {
        const comments = await fetchAllComments(confluence, pageId);
        return formatConfluenceComments(comments, confluenceConfig);
    }
    catch (error) {
        console.error("Error fetching Confluence comments:", error);
        return `Comments:\nFailed to retrieve comments: ${error.message}`;
    }
};
export const getConfluencePageSchema = {
    pageIdOrUrl: z
        .string()
        .describe("The page ID (e.g., 123456) or full Confluence page URL"),
    includeBody: z
        .boolean()
        .default(true)
        .describe("Include page body content (default: true)"),
    expandProperties: z
        .array(z.string())
        .optional()
        .describe("Additional properties to expand (e.g., ['version', 'space', 'ancestors'])"),
};
export const getConfluencePageHandler = (confluence, confluenceConfig) => async ({ pageIdOrUrl, includeBody, expandProperties, }) => {
    const configError = validateConfluenceConfig(confluenceConfig);
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
        const pageId = extractPageId(pageIdOrUrl);
        if (!pageId) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Cannot extract page ID from URL: ${pageIdOrUrl}`,
                    },
                ],
            };
        }
        // Build expand parameter
        const expandParams = ["space", "history", "version"];
        if (includeBody) {
            expandParams.push("body.storage");
        }
        if (expandProperties) {
            expandParams.push(...expandProperties);
        }
        const response = await confluence.get(`/content/${pageId}`, {
            params: {
                expand: expandParams.join(","),
            },
        });
        const page = response.data;
        if (!page) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Page not found: ${pageId}`,
                    },
                ],
            };
        }
        let content = `Title: ${page.title}\n`;
        content += `Space: ${page.space?.name || "Unknown"}\n`;
        content += `Type: ${page.type}\n`;
        content += `Status: ${page.status}\n`;
        content += `Created: ${formatCreatedAt(page)}\n`;
        const webui = page._links?.webui || "";
        const baseUrl = page._links?.base ||
            normalizeConfluenceHost(confluenceConfig.host);
        content += `URL: ${webui ? `${baseUrl}${webui}` : "URL not available"}\n`;
        if (includeBody && page.body?.storage?.value) {
            content += `\nContent:\n${page.body.storage.value}`;
        }
        const commentsSection = await getCommentsSection(confluence, confluenceConfig, pageId);
        content += `\n\n${commentsSection}`;
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching Confluence page:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve page: ${error.message}`,
                },
            ],
        };
    }
};
