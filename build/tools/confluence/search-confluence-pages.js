import { z } from "zod";
import { validateConfluenceConfig } from "../../utils/validation.js";
export const searchConfluencePagesSchema = {
    query: z.string().describe("Search query (title or content)"),
    spaceKey: z
        .string()
        .optional()
        .describe("Limit search to specific space (e.g., 'PROJ')"),
    type: z
        .enum(["page", "blogpost"])
        .default("page")
        .describe("Content type to search for"),
    limit: z
        .number()
        .default(10)
        .describe("Maximum number of results (default: 10, max: 50)"),
};
export const searchConfluencePagesHandler = (confluence, confluenceConfig) => async ({ query, spaceKey, type, limit, }) => {
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
        // Build CQL (Confluence Query Language) query
        let cqlQuery = `text ~ "${query}" AND type = "${type}"`;
        if (spaceKey) {
            cqlQuery += ` AND space = "${spaceKey}"`;
        }
        // Debug logging (can be removed in production)
        // console.error("CQL Query:", cqlQuery);
        // console.error("Confluence host:", confluenceConfig.host);
        const response = await confluence.get("/search", {
            params: {
                cql: cqlQuery,
                limit: Math.min(limit, 50),
                expand: "space,version",
            },
        });
        const results = response.data?.results || [];
        if (results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No ${type}s found for query: "${query}"${spaceKey ? ` in space ${spaceKey}` : ""}`,
                    },
                ],
            };
        }
        const formattedResults = [
            `Found ${results.length} ${type}(s) for query: "${query}"${spaceKey ? ` in space ${spaceKey}` : ""}`,
            "",
        ];
        results.forEach((result, index) => {
            // Confluence API возвращает данные в structure: result.content содержит основную информацию
            const content = result.content || {};
            // Очищаем заголовок от разметки поиска Confluence @@@hl@@@ и @@@endhl@@@
            const rawTitle = content.title || result.title || "No title";
            const title = rawTitle.replace(/@@@hl@@@|@@@endhl@@@/g, "");
            const space = result.resultGlobalContainer?.title || "Unknown space";
            const spaceUrl = result.resultGlobalContainer?.displayUrl || "";
            const webui = content._links?.webui || result.url || "";
            const url = webui
                ? `${confluenceConfig.host}${webui}`
                : "URL not available";
            const lastModified = result.friendlyLastModified || "Unknown";
            const pageId = content.id || "Unknown ID";
            formattedResults.push(`${index + 1}. ${title}`, `   ID: ${pageId}`, `   Space: ${space} (${spaceUrl})`, `   Last modified: ${lastModified}`, `   URL: ${url}`, `   Excerpt: ${result.excerpt
                ? result.excerpt
                    .replace(/@@@hl@@@|@@@endhl@@@/g, "")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&hellip;/g, "...")
                    .substring(0, 150) + "..."
                : "No preview"}`, "");
        });
        return {
            content: [
                {
                    type: "text",
                    text: formattedResults.join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error searching Confluence:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Search failed: ${error.message}`,
                },
            ],
        };
    }
};
