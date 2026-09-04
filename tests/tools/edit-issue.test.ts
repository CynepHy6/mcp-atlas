import { editIssueHandler } from "../../src/tools/jira/edit-issue.js";

describe("editIssueHandler", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const createMockJira = (editIssue = jest.fn()) =>
        ({
            issues: { editIssue },
        }) as any;

    it("updates an issue by key and reports changed fields", async () => {
        const editIssue = jest.fn().mockResolvedValue(undefined);
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "proj-42",
            summary: "Renamed task",
            description: "h2. What\n\nUpdated",
        });

        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: {
                summary: "Renamed task",
                description: "h2. What\n\nUpdated",
            },
        });
        expect(result.content[0].text).toContain("Issue updated successfully");
        expect(result.content[0].text).toContain("Key: PROJ-42");
        expect(result.content[0].text).toContain("Updated fields: summary, description");
        expect(result.content[0].text).toContain(
            "URL: https://jira.example.com/browse/PROJ-42",
        );
    });

    it("accepts a browse URL and maps optional fields with explicit overrides", async () => {
        const editIssue = jest.fn().mockResolvedValue(undefined);
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        await handler({
            issueKey: "https://jira.example.com/browse/PROJ-42",
            issueType: "Bug",
            parentKey: "https://jira.example.com/browse/PROJ-10",
            assignee: "jdoe",
            priority: "Major",
            labels: ["backend"],
            components: ["API"],
            dueDate: "2026-09-10",
            additionalFields: {
                summary: "Should be overwritten",
                customfield_12345: "Team A",
            },
            summary: "Real summary",
        });

        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: {
                summary: "Real summary",
                customfield_12345: "Team A",
                issuetype: { name: "Bug" },
                parent: { key: "PROJ-10" },
                assignee: { name: "jdoe" },
                priority: { name: "Major" },
                labels: ["backend"],
                components: [{ name: "API" }],
                duedate: "2026-09-10",
            },
        });
    });

    it("allows an additionalFields-only update", async () => {
        const editIssue = jest.fn().mockResolvedValue(undefined);
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            additionalFields: { customfield_12345: "Team A" },
        });

        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: { customfield_12345: "Team A" },
        });
        expect(result.content[0].text).toContain("Issue updated successfully");
        expect(result.content[0].text).toContain("Updated fields: customfield_12345");
    });

    it("rejects an empty update without calling Jira", async () => {
        const editIssue = jest.fn();
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Nothing to update");
    });

    it("rejects an invalid issue key", async () => {
        const editIssue = jest.fn();
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "https://example.com/not-a-ticket",
            summary: "Nope",
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from issueKey",
        );
    });

    it("rejects an invalid parentKey", async () => {
        const editIssue = jest.fn();
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            parentKey: "https://example.com/not-a-ticket",
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from parentKey",
        );
    });

    it("surfaces Jira field errors", async () => {
        const editIssue = jest.fn().mockRejectedValue({
            status: 400,
            response: {
                errorMessages: [],
                errors: { description: "Operation value must be a string" },
            },
        });
        const handler = editIssueHandler(createMockJira(editIssue), mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            description: "bad",
        });

        expect(result.content[0].text).toContain("Failed to update issue PROJ-42");
        expect(result.content[0].text).toContain(
            "description: Operation value must be a string",
        );
        expect(result.content[0].text).not.toContain("Issue updated successfully");
    });

    it("validates configuration before calling Jira", async () => {
        const editIssue = jest.fn();
        const handler = editIssueHandler(createMockJira(editIssue), {
            ...mockConfig,
            username: "",
        });

        const result = await handler({
            issueKey: "PROJ-42",
            summary: "No config",
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Configuration error");
    });
});
