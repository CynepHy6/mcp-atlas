import { editCommentHandler } from "../../src/tools/jira/edit-comment.js";

describe("editCommentHandler", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const createMockJira = (updateComment = jest.fn()) =>
        ({
            issueComments: { updateComment },
        }) as any;

    it("replaces a comment body and keeps Jira notify default when omitted", async () => {
        const updateComment = jest.fn().mockResolvedValue({ id: "99" });
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "https://jira.example.com/browse/proj-42",
            commentId: " 99 ",
            body: "h2. Updated\n\nText",
        });

        expect(updateComment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            id: "99",
            comment: "h2. Updated\n\nText",
        });
        expect(result.content[0].text).toContain("Comment updated successfully");
        expect(result.content[0].text).toContain("Comment id: 99");
        expect(result.content[0].text).toContain("focusedCommentId=99");
    });

    it("passes notifyUsers only when set", async () => {
        const updateComment = jest.fn().mockResolvedValue({ id: "99" });
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        await handler({
            issueKey: "PROJ-42",
            commentId: "99",
            body: "silent",
            notifyUsers: false,
        });

        expect(updateComment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            id: "99",
            comment: "silent",
            notifyUsers: false,
        });
    });

    it("rejects a non-numeric comment id without calling Jira", async () => {
        const updateComment = jest.fn();
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            commentId: "comment-99",
            body: "hello",
        });

        expect(updateComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "commentId must be a numeric Jira comment id",
        );
    });

    it("rejects an empty body without calling Jira", async () => {
        const updateComment = jest.fn();
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            commentId: "99",
            body: " ",
        });

        expect(updateComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Nothing to update");
    });

    it("rejects an invalid issue key", async () => {
        const updateComment = jest.fn();
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "not-a-ticket",
            commentId: "99",
            body: "hello",
        });

        expect(updateComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from issueKey",
        );
    });

    it("surfaces Jira errors", async () => {
        const updateComment = jest.fn().mockRejectedValue({
            status: 403,
            response: {
                errorMessages: [],
                errors: { comment: "You do not have permission to edit this comment" },
            },
        });
        const handler = editCommentHandler(
            createMockJira(updateComment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            commentId: "99",
            body: "hello",
        });

        expect(result.content[0].text).toContain(
            "Failed to update comment 99 on PROJ-42",
        );
        expect(result.content[0].text).toContain(
            "You do not have permission to edit this comment",
        );
        expect(result.content[0].text).not.toContain(
            "Comment updated successfully",
        );
    });

    it("validates configuration before calling Jira", async () => {
        const updateComment = jest.fn();
        const handler = editCommentHandler(createMockJira(updateComment), {
            ...mockConfig,
            host: "",
        });

        const result = await handler({
            issueKey: "PROJ-42",
            commentId: "99",
            body: "hello",
        });

        expect(updateComment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Configuration error");
    });
});
