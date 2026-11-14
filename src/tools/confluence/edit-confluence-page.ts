import { AxiosError, AxiosInstance } from "axios";
import { z } from "zod";
import { ConfluenceConfig } from "../../clients/confluence-client.js";
import { validateConfluenceConfig } from "../../utils/validation.js";

export const editConfluencePageSchema = {
    pageIdOrUrl: z
        .string()
        .describe("The page ID (e.g., 123456) or full Confluence page URL"),
    title: z
        .string()
        .optional()
        .describe("New page title (optional if content is provided)"),
    content: z
        .string()
        .optional()
        .describe(
            "New page body in Confluence storage format (HTML/XML), optional if title is provided. Read existing page with get-confluence-page bodyFormat='storage' before editing.",
        ),
};

function normalizeConfluenceHost(host: string): string {
    return host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
}

function extractPageId(pageIdOrUrl: string): string | null {
    if (!pageIdOrUrl.includes("/")) {
        return pageIdOrUrl;
    }

    const urlParts = pageIdOrUrl.split("/");
    const pageIndex = urlParts.findIndex((part) => part === "pages");
    if (pageIndex >= 0 && pageIndex < urlParts.length - 1) {
        return urlParts[pageIndex + 1];
    }

    const match = pageIdOrUrl.match(/pageId=(\d+)/);
    if (match) {
        return match[1];
    }

    return null;
}

function formatConfluenceError(error: unknown): string {
    const axiosError = error as AxiosError<{ message?: string }>;
    const responseMessage = axiosError.response?.data?.message;

    if (responseMessage) {
        return responseMessage;
    }

    return (error as Error).message;
}

export const editConfluencePageHandler =
    (confluence: AxiosInstance, confluenceConfig: ConfluenceConfig) =>
    async ({
        pageIdOrUrl,
        title,
        content,
    }: {
        pageIdOrUrl: string;
        title?: string;
        content?: string;
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

        if (!title && !content) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Nothing to update: provide at least one of `title` or `content`.",
                    },
                ],
            };
        }

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

        try {
            const currentPageResponse = await confluence.get(
                `/content/${pageId}`,
                {
                    params: {
                        expand: "space,version,body.storage",
                    },
                },
            );
            const currentPage = currentPageResponse.data;

            if (!currentPage) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Page not found: ${pageId}`,
                        },
                    ],
                };
            }

            const nextVersionNumber = (currentPage.version?.number || 0) + 1;
            const updatedPayload = {
                id: pageId,
                type: currentPage.type || "page",
                title: title || currentPage.title,
                space: {
                    key: currentPage.space?.key,
                },
                body: {
                    storage: {
                        value:
                            content || currentPage.body?.storage?.value || "",
                        representation: "storage",
                    },
                },
                version: {
                    number: nextVersionNumber,
                },
            };

            const response = await confluence.put(
                `/content/${pageId}`,
                updatedPayload,
            );
            const updatedPage = response.data;
            const baseUrl =
                updatedPage._links?.base ||
                normalizeConfluenceHost(confluenceConfig.host);
            const pageUrl = updatedPage._links?.webui
                ? `${baseUrl}${updatedPage._links.webui}`
                : "URL not available";

            let resultText = `Page updated successfully\n`;
            resultText += `Title: ${updatedPage.title}\n`;
            resultText += `ID: ${updatedPage.id}\n`;
            resultText += `Space: ${
                updatedPage.space?.name || currentPage.space?.name || "Unknown"
            }\n`;
            resultText += `Status: ${updatedPage.status || currentPage.status || "current"}\n`;
            resultText += `Version: ${updatedPage.version?.number || nextVersionNumber}\n`;
            resultText += `URL: ${pageUrl}`;

            return {
                content: [
                    {
                        type: "text",
                        text: resultText,
                    },
                ],
            };
        } catch (error) {
            console.error("Error updating Confluence page:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to update page: ${formatConfluenceError(error)}`,
                    },
                ],
            };
        }
    };
