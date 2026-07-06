/** MCP server instructions (InitializeResult.instructions) — visible to the agent before tool choice. */
export const MCP_SERVER_INSTRUCTIONS = [
    "Jira issue URL or key (browse/GRW-…): call read-description first; read-comments for discussion context.",
    "Zephyr Scale (Tests.jspa, *-Tnnn keys, test cases/runs): use tools in this server only; do not WebFetch or curl Tests.jspa URLs.",
    "Tests.jspa#/v2/testCases?projectId=… is UI navigation only; pass projectKey (test-wdio --qaseProject), not numeric projectId alone.",
    "Unfamiliar Zephyr project: inspect-zephyr-project. test-wdio sync: upsert-zephyr-testcase (inspect → upsert).",
    "Tests.jspa #/testCase/KEY URLs: pass to get/update/delete tools — key is parsed from the URL, do not fetch the URL.",
    "Zephyr folders: get-zephyr-folder-tree to discover folderId/path (accepts projectId here), create-zephyr-folder to add, delete-zephyr-folder (confirm=true) to remove.",
    "Insight asset links (/secure/insight/assets/…): get-insight-asset or search-insight-assets.",
    "User-facing replies: return the fetched data. Do not meta-comment on tools, HTTP, auth, or access method unless the user explicitly asks.",
].join(" ");
