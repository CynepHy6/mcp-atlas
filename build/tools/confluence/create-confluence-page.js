import { z } from "zod";
import { validateConfluenceConfig } from "../../utils/validation.js";
export const createConfluencePageSchema = {
    spaceKey: z
        .string()
        .describe("Confluence space key where the page should be created"),
    title: z.string().describe("Title of the new Confluence page"),
    content: z
        .string()
        .describe("Page body in Confluence storage format (HTML/XML)"),
    parentPageIdOrUrl: z
        .string()
        .optional()
        .describe("Optional parent page ID or full Confluence page URL to create the page under"),
};
function normalizeConfluenceHost(host) {
    return host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
}
function extractPageId(pageIdOrUrl) {
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
function formatConfluenceError(error) {
    const axiosError = error;
    const responseMessage = axiosError.response?.data?.message;
    if (responseMessage) {
        return responseMessage;
    }
    return error.message;
}
export const createConfluencePageHandler = (confluence, confluenceConfig) => async ({ spaceKey, title, content, parentPageIdOrUrl, }) => {
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
        const payload = {
            type: "page",
            title,
            space: {
                key: spaceKey,
            },
            body: {
                storage: {
                    value: content,
                    representation: "storage",
                },
            },
        };
        if (parentPageIdOrUrl) {
            const parentPageId = extractPageId(parentPageIdOrUrl);
            if (!parentPageId) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Cannot extract parent page ID from URL: ${parentPageIdOrUrl}`,
                        },
                    ],
                };
            }
            payload.ancestors = [{ id: parentPageId }];
        }
        const response = await confluence.post("/content", payload);
        const page = response.data;
        const normalizedHost = normalizeConfluenceHost(confluenceConfig.host);
        const pageUrl = page._links?.webui
            ? `${normalizedHost}${page._links.webui}`
            : "URL not available";
        let resultText = `Page created successfully\n`;
        resultText += `Title: ${page.title}\n`;
        resultText += `ID: ${page.id}\n`;
        resultText += `Space: ${page.space?.name || spaceKey}\n`;
        resultText += `Status: ${page.status || "current"}\n`;
        resultText += `Version: ${page.version?.number || 1}\n`;
        resultText += `URL: ${pageUrl}`;
        if (payload.ancestors?.[0]?.id) {
            resultText += `\nParent page ID: ${payload.ancestors[0].id}`;
        }
        return {
            content: [
                {
                    type: "text",
                    text: resultText,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating Confluence page:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to create page: ${formatConfluenceError(error)}`,
                },
            ],
        };
    }
};
