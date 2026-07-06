#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
// Try loading from parent directory of script
try {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
}
catch (e) {
    console.error("Error loading .env file:", e);
    // Ignore errors
}
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Import our refactored modules
// Import clients
import { createConfiguredConfluenceClient, getConfluenceConfig, } from "./clients/confluence-client.js";
import { createConfiguredInsightClient, } from "./clients/insight-client.js";
import { createConfiguredJiraClient, getJiraConfig, } from "./clients/jira-client.js";
import { createConfiguredZephyrClient, createConfiguredZephyrTestsClient, } from "./clients/zephyr-client.js";
// Import tool handlers
import { createConfluencePageHandler, createConfluencePageSchema, } from "./tools/confluence/create-confluence-page.js";
import { editConfluencePageHandler, editConfluencePageSchema, } from "./tools/confluence/edit-confluence-page.js";
import { getConfluencePageHandler, getConfluencePageSchema, } from "./tools/confluence/get-confluence-page.js";
import { searchConfluencePagesHandler, searchConfluencePagesSchema, } from "./tools/confluence/search-confluence-pages.js";
import { getRecentWorklogsHandler, getRecentWorklogsSchema, } from "./tools/jira/get-recent-worklogs.js";
import { getWorklogsByDaysHandler, getWorklogsByDaysSchema, } from "./tools/jira/get-worklogs-by-days.js";
import { getWorklogsHandler, getWorklogsSchema, } from "./tools/jira/get-worklogs.js";
import { readCommentsHandler, readCommentsSchema, } from "./tools/jira/read-comments.js";
import { readDescriptionHandler, readDescriptionSchema, } from "./tools/jira/read-description.js";
import { searchIssuesHandler, searchIssuesSchema, } from "./tools/jira/search-issues.js";
import { listAttachmentsHandler, listAttachmentsSchema, } from "./tools/jira/list-attachments.js";
import { downloadAttachmentHandler, downloadAttachmentSchema, } from "./tools/jira/download-attachment.js";
import { getInsightAssetHandler, getInsightAssetSchema, } from "./tools/insight/get-insight-asset.js";
import { searchInsightAssetsHandler, searchInsightAssetsSchema, } from "./tools/insight/search-insight-assets.js";
import { deleteZephyrTestCaseHandler, deleteZephyrTestCaseSchema, } from "./tools/zephyr/delete-zephyr-testcase.js";
import { inspectZephyrProjectHandler, inspectZephyrProjectSchema, } from "./tools/zephyr/inspect-zephyr-project.js";
import { createZephyrTestCaseHandler, createZephyrTestCaseSchema, } from "./tools/zephyr/create-zephyr-testcase.js";
import { upsertZephyrTestCaseHandler, upsertZephyrTestCaseSchema, } from "./tools/zephyr/upsert-zephyr-testcase.js";
import { createZephyrTestRunHandler, createZephyrTestRunSchema, } from "./tools/zephyr/create-zephyr-testrun.js";
import { getZephyrTestCaseHandler, getZephyrTestCaseSchema, } from "./tools/zephyr/get-zephyr-testcase.js";
import { searchZephyrTestCasesHandler, searchZephyrTestCasesSchema, } from "./tools/zephyr/search-zephyr-testcases.js";
import { sendZephyrTestResultHandler, sendZephyrTestResultSchema, } from "./tools/zephyr/send-zephyr-test-result.js";
import { updateZephyrTestCaseHandler, updateZephyrTestCaseSchema, } from "./tools/zephyr/update-zephyr-testcase.js";
import { getZephyrFolderTreeHandler, getZephyrFolderTreeSchema, } from "./tools/zephyr/get-zephyr-folder-tree.js";
import { createZephyrFolderHandler, createZephyrFolderSchema, } from "./tools/zephyr/create-zephyr-folder.js";
import { deleteZephyrFolderHandler, deleteZephyrFolderSchema, } from "./tools/zephyr/delete-zephyr-folder.js";
import { MCP_SERVER_INSTRUCTIONS } from "./utils/mcp-server-instructions.js";
// Initialize clients
const jiraConfig = getJiraConfig();
const confluenceConfig = getConfluenceConfig();
const jira = createConfiguredJiraClient();
const confluence = createConfiguredConfluenceClient();
const insight = createConfiguredInsightClient();
const zephyr = createConfiguredZephyrClient();
const zephyrTests = createConfiguredZephyrTestsClient();
// Initialize MCP server
const server = new McpServer({
    name: "jira-confluence-mcp",
    version: "1.5.4",
}, {
    capabilities: {
        tools: {},
    },
    instructions: MCP_SERVER_INSTRUCTIONS,
});
// Function to test Jira authentication
async function testJiraAuthentication() {
    try {
        const authType = jiraConfig.apiToken ? "API Token/PAT" : "Password";
        console.error(`Testing Jira authentication using ${authType}...`);
        await jira.myself.getCurrentUser();
        console.error("✅ Jira authentication successful");
        return null;
    }
    catch (error) {
        return `Authentication failed: ${error.message}`;
    }
}
// Register Jira tools
server.tool("read-description", "Get the description of a Jira issue. ALWAYS use this tool FIRST when a Jira issue URL or key is mentioned in the user query to understand the full context, requirements, and business logic before proceeding with code analysis or implementation.", readDescriptionSchema, readDescriptionHandler(jira, jiraConfig));
server.tool("read-comments", "Get the comments for a Jira issue. Use this tool to get additional context, clarifications, and discussions about the issue after reading the main description.", readCommentsSchema, readCommentsHandler(jira, jiraConfig));
server.tool("get-worklogs", "Get worklogs and task descriptions for yourself or a colleague", getWorklogsSchema, getWorklogsHandler(jira, jiraConfig));
server.tool("get-worklogs-by-days", "Get worklogs by specifying days and start date (yours or a colleague's)", getWorklogsByDaysSchema, getWorklogsByDaysHandler(jira, jiraConfig));
server.tool("search-issues", "Search for Jira issues by title (summary) or description. Use this when you need to find related issues or when working on tasks that might have dependencies on other tickets.", searchIssuesSchema, searchIssuesHandler(jira, jiraConfig));
server.tool("get-recent-worklogs", "Get worklogs for standard time periods (yours or a colleague's)", getRecentWorklogsSchema, getRecentWorklogsHandler(jira, jiraConfig));
server.tool("list-attachments", "List metadata of attachments on a Jira issue (id, filename, mimeType, size, created, author, content URL). Call before download-attachment to discover attachmentId.", listAttachmentsSchema, listAttachmentsHandler(jira, jiraConfig));
server.tool("download-attachment", "Download a Jira attachment to disk. Identify by attachmentId (preferred) or by issueKey + filename. Saves to saveDir (defaults to MCP server cwd) and returns the saved path. Set overwrite=true to replace an existing file.", downloadAttachmentSchema, downloadAttachmentHandler(jira, jiraConfig));
server.tool("get-insight-asset", "Get a Jira Insight (Assets) object by object key, numeric id, or Insight asset URL. Use this when a link like /secure/insight/assets/INFRA-123 is mentioned.", getInsightAssetSchema, getInsightAssetHandler(insight, jiraConfig));
server.tool("search-insight-assets", "Search Jira Insight (Assets) objects using IQL. Use for finding teams, services, people and other CMDB objects.", searchInsightAssetsSchema, searchInsightAssetsHandler(insight, jiraConfig));
server.tool("inspect-zephyr-project", "Inspect an unfamiliar Zephyr project before creating cases. Returns custom field values, folder examples, and sample cases. Use projectKey from test-wdio --qaseProject.", inspectZephyrProjectSchema, inspectZephyrProjectHandler(zephyr, jiraConfig));
server.tool("upsert-zephyr-testcase", "Sync test-wdio specs to Zephyr. Pass wdioItTitle (full it() string), precondition, testScriptPlainText. Title ending with #PREFIX-Tnnn → update; otherwise create and return key for it(). On create: projectKey or inheritCustomFieldsFrom.", upsertZephyrTestCaseSchema, upsertZephyrTestCaseHandler(zephyr, jiraConfig));
server.tool("get-zephyr-testcase", "Read one Zephyr case. Accepts test case key or Tests.jspa #/testCase/KEY URL.", getZephyrTestCaseSchema, getZephyrTestCaseHandler(zephyr, jiraConfig));
server.tool("search-zephyr-testcases", "Find Zephyr cases by projectKey or IQL query. Use when the #PREFIX-Tnnn key is unknown or you need inheritCustomFieldsFrom reference.", searchZephyrTestCasesSchema, searchZephyrTestCasesHandler(zephyr, jiraConfig));
server.tool("create-zephyr-testcase", "Low-level create. Prefer upsert-zephyr-testcase for test-wdio workflows.", createZephyrTestCaseSchema, createZephyrTestCaseHandler(zephyr, jiraConfig));
server.tool("update-zephyr-testcase", "Low-level update by key. Prefer upsert-zephyr-testcase for test-wdio workflows.", updateZephyrTestCaseSchema, updateZephyrTestCaseHandler(zephyr, jiraConfig));
server.tool("delete-zephyr-testcase", "Permanently delete a test case by key or URL. Requires confirm=true. Call get-zephyr-testcase first to verify.", deleteZephyrTestCaseSchema, deleteZephyrTestCaseHandler(zephyr, jiraConfig));
server.tool("create-zephyr-testrun", "Create a Zephyr Scale test run for a project.", createZephyrTestRunSchema, createZephyrTestRunHandler(zephyr, jiraConfig));
server.tool("send-zephyr-test-result", "Record Pass/Fail/Blocked/Not Executed for a testcase inside a test run.", sendZephyrTestResultSchema, sendZephyrTestResultHandler(zephyr, jiraConfig));
server.tool("get-zephyr-folder-tree", "List the test-case folder tree of a Zephyr project (folderId, item count, full path). Use before creating cases/folders to pick the right path, or before delete-zephyr-folder to get the folderId. Accepts project key, numeric projectId, or a Tests.jspa projectId= URL.", getZephyrFolderTreeSchema, getZephyrFolderTreeHandler(zephyrTests, jiraConfig));
server.tool("create-zephyr-folder", "Create a Zephyr test-case folder. Pass projectKey and a folder name or full path (optionally parentPath). Use get-zephyr-folder-tree first to see existing paths.", createZephyrFolderSchema, createZephyrFolderHandler(zephyr, jiraConfig));
server.tool("delete-zephyr-folder", "Permanently delete a Zephyr folder by numeric folderId. Requires confirm=true. Call get-zephyr-folder-tree first to confirm the id and that it is empty.", deleteZephyrFolderSchema, deleteZephyrFolderHandler(zephyrTests, jiraConfig));
// Register Confluence tools
server.tool("create-confluence-page", "Create a new Confluence page in a space, optionally under a parent page. The content must be provided in Confluence storage format (HTML/XML).", createConfluencePageSchema, createConfluencePageHandler(confluence, confluenceConfig));
server.tool("edit-confluence-page", "Update an existing Confluence page by ID or URL. Supports changing title and/or content in Confluence storage format (HTML/XML).", editConfluencePageSchema, editConfluencePageHandler(confluence, confluenceConfig));
server.tool("get-confluence-page", "Get the content of a Confluence page by ID or URL together with page comments", getConfluencePageSchema, getConfluencePageHandler(confluence, confluenceConfig));
server.tool("search-confluence-pages", "Search for Confluence pages by title or content", searchConfluencePagesSchema, searchConfluencePagesHandler(confluence, confluenceConfig));
// Start server
async function main() {
    try {
        // Test authentication
        const authError = await testJiraAuthentication();
        if (authError) {
            console.error(`❌ ${authError}`);
            console.error("Please check your environment variables and authentication configuration.");
            process.exit(1);
        }
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("✅ Jira/Confluence MCP server running on stdio");
    }
    catch (error) {
        console.error("Error starting Jira MCP server:", error);
        process.exit(1);
    }
}
main();
