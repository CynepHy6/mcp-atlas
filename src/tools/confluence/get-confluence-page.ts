import { AxiosError, AxiosInstance } from "axios";
import { z } from "zod";
import { ConfluenceConfig } from "../../clients/confluence-client.js";
import { confluenceStorageToMarkdown } from "../../utils/confluence-storage.js";
import { validateConfluenceConfig } from "../../utils/validation.js";

export type ConfluenceBodyFormat = "compact" | "storage";

interface ConfluenceUser {
    displayName?: string;
    username?: string;
    email?: string;
}

interface ConfluenceCommentResolution {
    status?: string;
}

interface ConfluenceCommentInlineProperties {
    textSelection?: string;
}

interface ConfluenceCommentExtensions {
    location?: string;
    resolution?: ConfluenceCommentResolution;
    inlineProperties?: ConfluenceCommentInlineProperties;
}

interface ConfluenceComment {
    id: string;
    type?: string;
    status?: string;
    title?: string;
    body?: {
        storage?: {
            value?: string;
        };
    };
    history?: {
        createdDate?: string;
        createdBy?: ConfluenceUser;
    };
    version?: {
        when?: string;
        by?: ConfluenceUser;
    };
    extensions?: ConfluenceCommentExtensions;
    _links?: {
        base?: string;
        webui?: string;
    };
}

interface ConfluenceCommentsResponse {
    results?: ConfluenceComment[];
    size?: number;
    limit?: number;
    _links?: {
        next?: string;
    };
}

const normalizeConfluenceHost = (host: string): string =>
    host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;

const formatConfluenceError = (error: unknown): string => {
    const axiosError = error as AxiosError<{ message?: string }>;
    const status = axiosError?.response?.status;
    const responseMessage = axiosError?.response?.data?.message;

    if (status && responseMessage) {
        return `HTTP ${status}: ${responseMessage}`;
    }
    if (responseMessage) {
        return responseMessage;
    }
    if (status) {
        return `HTTP ${status}: ${(error as Error)?.message || "Request failed"}`;
    }

    return (error as Error)?.message || String(error);
};

const formatCreatedAt = (page: {
    history?: { createdDate?: string };
    version?: { when?: string };
}): string => {
    const createdAt = page.history?.createdDate || page.version?.when;
    if (!createdAt) {
        return "Unknown";
    }

    const parsedDate = new Date(createdAt);
    return Number.isNaN(parsedDate.getTime())
        ? "Unknown"
        : parsedDate.toLocaleString();
};

const extractPageId = (pageIdOrUrl: string): string | null => {
    const trimmed = pageIdOrUrl.trim();
    if (!trimmed) {
        return null;
    }

    if (!trimmed.includes("/")) {
        return trimmed;
    }

    const pageIdMatch = trimmed.match(/[?&]pageId=(\d+)/);
    if (pageIdMatch) {
        return pageIdMatch[1];
    }

    const urlParts = trimmed.split("/");
    const pageIndex = urlParts.findIndex((part) => part === "pages");
    if (pageIndex >= 0 && pageIndex < urlParts.length - 1) {
        const candidate = urlParts[pageIndex + 1]?.split(/[?#]/)[0]?.trim();
        if (candidate) {
            return candidate;
        }
    }

    return null;
};

const formatCommentAuthor = (comment: ConfluenceComment): string =>
    comment.history?.createdBy?.displayName ||
    comment.version?.by?.displayName ||
    comment.history?.createdBy?.username ||
    comment.version?.by?.username ||
    comment.history?.createdBy?.email ||
    comment.version?.by?.email ||
    "Unknown";

const formatCommentDate = (comment: ConfluenceComment): string => {
    const createdAt = comment.history?.createdDate || comment.version?.when;
    if (!createdAt) {
        return "Unknown";
    }

    const parsedDate = new Date(createdAt);
    return Number.isNaN(parsedDate.getTime())
        ? "Unknown"
        : parsedDate.toLocaleString();
};

const formatCommentUrl = (
    comment: ConfluenceComment,
    confluenceConfig: ConfluenceConfig
): string | null => {
    const webui = comment._links?.webui;
    if (!webui) {
        return null;
    }

    const baseUrl =
        comment._links?.base || normalizeConfluenceHost(confluenceConfig.host);
    return `${baseUrl}${webui}`;
};

const formatBodyValue = (
    storageValue: string | undefined,
    bodyFormat: ConfluenceBodyFormat,
): string => {
    if (!storageValue) {
        return "";
    }
    if (bodyFormat === "storage") {
        return storageValue;
    }
    return confluenceStorageToMarkdown(storageValue);
};

const formatConfluenceComments = (
    comments: ConfluenceComment[],
    confluenceConfig: ConfluenceConfig,
    bodyFormat: ConfluenceBodyFormat,
    commentsLimit?: number,
): string => {
    if (comments.length === 0) {
        return "Comments:\nNo comments found.";
    }

    const selectedComments =
        commentsLimit !== undefined
            ? comments.slice(-commentsLimit)
            : comments;
    const skippedCount = Math.max(
        0,
        comments.length - selectedComments.length,
    );

    const commentBlocks = selectedComments.map((comment, index) => {
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
            commentLines.push(
                `   Resolution: ${comment.extensions.resolution.status}`
            );
        }

        if (comment.extensions?.inlineProperties?.textSelection) {
            commentLines.push(
                `   Selected text: ${comment.extensions.inlineProperties.textSelection}`
            );
        }

        const commentUrl = formatCommentUrl(comment, confluenceConfig);
        if (commentUrl) {
            commentLines.push(`   URL: ${commentUrl}`);
        }

        const formattedCommentBody = formatBodyValue(
            comment.body?.storage?.value,
            bodyFormat,
        );
        commentLines.push(
            `   Comment:\n${formattedCommentBody || "No content"}`
        );

        return commentLines.join("\n");
    });

    const header =
        skippedCount > 0
            ? `Comments (showing last ${selectedComments.length} of ${comments.length} total, ${skippedCount} earlier skipped):`
            : `Comments (${comments.length}):`;

    return `${header}\n\n${commentBlocks.join("\n\n")}`;
};

const getCommentsExpand = (): string =>
    [
        "body.storage",
        "history",
        "version",
        "extensions.resolution",
        "extensions.inlineProperties",
    ].join(",");

const fetchAllComments = async (
    confluence: AxiosInstance,
    pageId: string
): Promise<ConfluenceComment[]> => {
    const comments: ConfluenceComment[] = [];
    const commentsExpand = getCommentsExpand();
    let startIndex = 0;
    const pageSize = 100;

    while (true) {
        const response = await confluence.get<ConfluenceCommentsResponse>(
            `/content/${pageId}/child/comment`,
            {
                params: {
                    expand: commentsExpand,
                    limit: pageSize,
                    start: startIndex,
                },
            }
        );

        const fetchedComments = response.data.results || [];
        comments.push(...fetchedComments);

        if (
            fetchedComments.length === 0 ||
            fetchedComments.length < pageSize ||
            !response.data._links?.next
        ) {
            return comments;
        }

        startIndex += fetchedComments.length;
    }
};

const getCommentsSection = async (
    confluence: AxiosInstance,
    confluenceConfig: ConfluenceConfig,
    pageId: string,
    bodyFormat: ConfluenceBodyFormat,
    commentsLimit?: number,
): Promise<string> => {
    try {
        const comments = await fetchAllComments(confluence, pageId);
        return formatConfluenceComments(
            comments,
            confluenceConfig,
            bodyFormat,
            commentsLimit,
        );
    } catch (error) {
        console.error("Error fetching Confluence comments:", error);
        return `Comments:\nFailed to retrieve comments: ${formatConfluenceError(
            error,
        )}`;
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
    bodyFormat: z
        .enum(["compact", "storage"])
        .default("compact")
        .describe(
            "Page body representation: 'compact' (default) converts Confluence Storage XHTML into clean Markdown (preserving headings, lists, tables, code macros, links, and ~~strikethrough~~); use 'storage' to read raw Confluence Storage XHTML required before edit-confluence-page.",
        ),
    includeComments: z
        .boolean()
        .default(false)
        .describe(
            "Fetch and include page comments (default: false; avoids extra HTTP requests when comments are not needed)",
        ),
    commentsLimit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            "Maximum number of latest page comments to render in the response when includeComments=true (trims output size with total and skipped counts)",
        ),
    expandProperties: z
        .array(z.string())
        .optional()
        .describe(
            "Additional properties to expand (e.g., ['version', 'space', 'ancestors'])",
        ),
};

export const getConfluencePageHandler =
    (confluence: AxiosInstance, confluenceConfig: ConfluenceConfig) =>
    async ({
        pageIdOrUrl,
        includeBody = true,
        bodyFormat = "compact",
        includeComments = false,
        commentsLimit,
        expandProperties,
    }: {
        pageIdOrUrl: string;
        includeBody?: boolean;
        bodyFormat?: ConfluenceBodyFormat;
        includeComments?: boolean;
        commentsLimit?: number;
        expandProperties?: string[];
    }) => {
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

        if (
            commentsLimit !== undefined &&
            (!Number.isInteger(commentsLimit) || commentsLimit < 1)
        ) {
            return {
                content: [
                    {
                        type: "text",
                        text: `commentsLimit must be a positive integer (got ${commentsLimit}).`,
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
            const baseUrl =
                page._links?.base ||
                normalizeConfluenceHost(confluenceConfig.host);
            content += `URL: ${
                webui ? `${baseUrl}${webui}` : "URL not available"
            }\n`;

            if (includeBody && page.body?.storage?.value !== undefined) {
                const formattedBody = formatBodyValue(
                    page.body.storage.value,
                    bodyFormat,
                );
                if (formattedBody) {
                    content += `\nContent:\n${formattedBody}`;
                }
            }

            if (includeComments) {
                const commentsSection = await getCommentsSection(
                    confluence,
                    confluenceConfig,
                    pageId,
                    bodyFormat,
                    commentsLimit,
                );
                content += `\n\n${commentsSection}`;
            } else if (commentsLimit !== undefined) {
                content += `\n\nNote: commentsLimit=${commentsLimit} was ignored because includeComments=false. Pass includeComments=true to include comments.`;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: content,
                    },
                ],
            };
        } catch (error) {
            console.error("Error fetching Confluence page:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve page: ${formatConfluenceError(
                            error,
                        )}`,
                    },
                ],
            };
        }
    };
