import { createCommentHandler } from "../../src/tools/jira/create-comment.js";

describe("createCommentHandler", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const createMockJira = (addComment = jest.fn()) =>
        ({
            issueComments: { addComment },
        }) as any;

    it("creates a comment by issue key and returns the id", async () => {
        const addComment = jest.fn().mockResolvedValue({ id: "99" });
        const handler = createCommentHandler(
            createMockJira(addComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "proj-42",
            body: "h2. Note\n\nDone",
        });

        expect(addComment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            comment: "h2. Note\n\nDone",
        });
        expect(result.content[0].text).toContain("Comment created successfully");
        expect(result.content[0].text).toContain("Issue: PROJ-42");
        expect(result.content[0].text).toContain("Comment id: 99");
        expect(result.content[0].text).toContain(
            "URL: https://jira.example.com/browse/PROJ-42?focusedCommentId=99&page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel#comment-99",
        );
    });

    it("accepts a browse URL", async () => {
        const addComment = jest.fn().mockResolvedValue({ id: "7" });
        const handler = createCommentHandler(
            createMockJira(addComment),
            mockConfig,
        );

        await handler({
            issueKey: "https://jira.example.com/browse/PROJ-42",
            body: "hello",
        });

        expect(addComment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            comment: "hello",
        });
    });

    it("rejects an empty body without calling Jira", async () => {
        const addComment = jest.fn();
        const handler = createCommentHandler(
            createMockJira(addComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            body: "   ",
        });

        expect(addComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Nothing to post");
    });

    it("rejects an invalid issue key", async () => {
        const addComment = jest.fn();
        const handler = createCommentHandler(
            createMockJira(addComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "https://example.com/not-a-ticket",
            body: "hello",
        });

        expect(addComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from issueKey",
        );
    });

    it("surfaces Jira errors", async () => {
        const addComment = jest.fn().mockRejectedValue({
            status: 400,
            response: {
                errorMessages: ["Issue does not exist"],
                errors: {},
            },
        });
        const handler = createCommentHandler(
            createMockJira(addComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            body: "hello",
        });

        expect(result.content[0].text).toContain(
            "Failed to create comment on PROJ-42",
        );
        expect(result.content[0].text).toContain("Issue does not exist");
        expect(result.content[0].text).not.toContain(
            "Comment created successfully",
        );
    });

    it("validates configuration before calling Jira", async () => {
        const addComment = jest.fn();
        const handler = createCommentHandler(createMockJira(addComment), {
            ...mockConfig,
            username: "",
        });

        const result = await handler({
            issueKey: "PROJ-42",
            body: "hello",
        });

        expect(addComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Configuration error");
    });
});
