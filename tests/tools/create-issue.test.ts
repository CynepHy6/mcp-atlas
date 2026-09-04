import { createIssueHandler } from "../../src/tools/jira/create-issue.js";
import {
    buildIssueBrowseUrl,
    extractIssueKey,
    formatJiraError,
    isSubtaskType,
} from "../../src/utils/jira-issue.js";

describe("create-issue helpers", () => {
    it("extracts a bare issue key", () => {
        expect(extractIssueKey("proj-123")).toBe("PROJ-123");
    });

    it("extracts an issue key from a browse URL", () => {
        expect(
            extractIssueKey("https://jira.example.com/browse/PROJ-99"),
        ).toBe("PROJ-99");
    });

    it("rejects values that are not issue keys", () => {
        expect(extractIssueKey("https://example.com/not-a-ticket")).toBeNull();
        expect(extractIssueKey("")).toBeNull();
    });

    it("detects sub-task type names", () => {
        expect(isSubtaskType("Sub-task")).toBe(true);
        expect(isSubtaskType("Подзадача")).toBe(true);
        expect(isSubtaskType("Task")).toBe(false);
    });

    it("builds a browse URL from a host with or without protocol", () => {
        expect(buildIssueBrowseUrl("jira.example.com", "PROJ-1")).toBe(
            "https://jira.example.com/browse/PROJ-1",
        );
        expect(buildIssueBrowseUrl("https://jira.example.com/", "PROJ-1")).toBe(
            "https://jira.example.com/browse/PROJ-1",
        );
    });

    it("formats jira.js HttpException payload", () => {
        expect(
            formatJiraError({
                status: 400,
                response: {
                    errorMessages: ["Field is required"],
                    errors: { customfield_1: "Team is required" },
                },
            }),
        ).toBe("HTTP 400: Field is required; customfield_1: Team is required");
    });

    it("formats axios-style error payload", () => {
        expect(
            formatJiraError({
                response: {
                    status: 400,
                    data: {
                        errorMessages: [],
                        errors: { summary: "You must specify a summary" },
                    },
                },
            }),
        ).toBe("HTTP 400: summary: You must specify a summary");
    });
});

describe("createIssueHandler", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const createMockJira = (createIssue = jest.fn()) =>
        ({
            issues: { createIssue },
        }) as any;

    it("creates an issue and returns key plus browse URL", async () => {
        const createIssue = jest.fn().mockResolvedValue({
            id: "10001",
            key: "PROJ-42",
            self: "https://jira.example.com/rest/api/2/issue/10001",
        });
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Task",
            summary: "New task",
            description: "h2. What\n\nDo the thing",
        });

        expect(createIssue).toHaveBeenCalledWith({
            fields: {
                project: { key: "PROJ" },
                issuetype: { name: "Task" },
                summary: "New task",
                description: "h2. What\n\nDo the thing",
            },
        });
        expect(result.content[0].text).toContain("Issue created successfully");
        expect(result.content[0].text).toContain("Key: PROJ-42");
        expect(result.content[0].text).toContain(
            "URL: https://jira.example.com/browse/PROJ-42",
        );
    });

    it("maps optional fields and lets explicit args override additionalFields", async () => {
        const createIssue = jest.fn().mockResolvedValue({
            id: "10002",
            key: "PROJ-43",
        });
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        await handler({
            projectKey: "PROJ",
            issueType: "Bug",
            summary: "Real summary",
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
        });

        expect(createIssue).toHaveBeenCalledWith({
            fields: {
                summary: "Real summary",
                customfield_12345: "Team A",
                project: { key: "PROJ" },
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

    it("requires parentKey for a sub-task", async () => {
        const createIssue = jest.fn();
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Sub-task",
            summary: "Child work",
        });

        expect(createIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("parentKey is required");
    });

    it("rejects an invalid parentKey", async () => {
        const createIssue = jest.fn();
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Task",
            summary: "Broken parent",
            parentKey: "https://example.com/not-a-ticket",
        });

        expect(createIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from parentKey",
        );
    });

    it("does not report success when Jira omits the issue key", async () => {
        const createIssue = jest.fn().mockResolvedValue({
            id: "10003",
        });
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Task",
            summary: "No key",
        });

        expect(result.content[0].text).toContain("Failed to create issue");
        expect(result.content[0].text).toContain("did not return an issue key");
        expect(result.content[0].text).not.toContain("Issue created successfully");
    });

    it("surfaces Jira required-field errors", async () => {
        const createIssue = jest.fn().mockRejectedValue({
            status: 400,
            response: {
                errorMessages: [],
                errors: { customfield_12345: "Team is required." },
            },
        });
        const handler = createIssueHandler(createMockJira(createIssue), mockConfig);

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Task",
            summary: "Missing team",
        });

        expect(result.content[0].text).toContain("Failed to create issue");
        expect(result.content[0].text).toContain(
            "customfield_12345: Team is required.",
        );
    });

    it("validates configuration before calling Jira", async () => {
        const createIssue = jest.fn();
        const handler = createIssueHandler(createMockJira(createIssue), {
            ...mockConfig,
            username: "",
        });

        const result = await handler({
            projectKey: "PROJ",
            issueType: "Task",
            summary: "No config",
        });

        expect(createIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Configuration error");
    });
});
