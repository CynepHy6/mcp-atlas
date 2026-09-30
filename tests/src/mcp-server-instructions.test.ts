import { MCP_SERVER_INSTRUCTIONS } from "../../src/utils/mcp-server-instructions.js";

describe("mcp-server-instructions", () => {
    it("routes Zephyr and Jira URLs to MCP tools, not WebFetch", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain(
            "do not WebFetch or curl Tests.jspa URLs",
        );
        expect(MCP_SERVER_INSTRUCTIONS).not.toContain("503");
        expect(MCP_SERVER_INSTRUCTIONS).toContain(
            "projectId=… is UI navigation only",
        );
        expect(MCP_SERVER_INSTRUCTIONS).toContain("read-description first");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("create-issue");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("edit-issue");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("Labels line from read-description");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("addLabels");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("removeLabels");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("create-comment");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("edit-comment");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("inspect-zephyr-project");
        expect(MCP_SERVER_INSTRUCTIONS).toContain(
            "Do not meta-comment on tools",
        );
    });
});
