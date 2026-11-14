import {
    readCommentsHandler,
    readCommentsSchema,
} from "../../src/tools/jira/read-comments.js";
import {
    ISSUE_DESCRIPTION_FIELDS,
    readDescriptionHandler,
    readDescriptionSchema,
} from "../../src/tools/jira/read-description.js";
import {
    searchIssuesHandler,
    searchIssuesSchema,
} from "../../src/tools/jira/search-issues.js";

describe("Jira compact read & search tools", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const makeComment = (id: number, body = `Comment #${id}`) => ({
        id: String(id),
        author: { displayName: `User ${id}` },
        body,
        created: `2026-01-${String((id % 28) + 1).padStart(2, "0")}T10:00:00.000+0000`,
        updated: `2026-01-${String((id % 28) + 1).padStart(2, "0")}T10:00:00.000+0000`,
    });

    describe("readDescriptionSchema & readDescriptionHandler", () => {
        it("defaults includeComments to false in schema", () => {
            expect(readDescriptionSchema.includeComments.parse(undefined)).toBe(
                false,
            );
            expect(
                readDescriptionSchema.commentsLimit.parse(undefined),
            ).toBeUndefined();
        });

        it("fetches targeted fields once without *all or comments by default", async () => {
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-101",
                fields: {
                    summary: "Compact issue fetch",
                    description: "Detailed body",
                    issuetype: { name: "Task" },
                    priority: { name: "Major" },
                    status: { name: "In Progress" },
                    labels: ["mcp", "perf"],
                    project: { key: "PROJ" },
                    subtasks: [],
                    issuelinks: [],
                },
            });
            const getComments = jest.fn();
            const searchForIssuesUsingJql = jest.fn();

            const jira = {
                issues: { getIssue },
                issueComments: { getComments },
                issueSearch: { searchForIssuesUsingJql },
            } as any;

            const handler = readDescriptionHandler(jira, mockConfig);
            const result = await handler({
                issueKey: "https://jira.example.com/browse/proj-101",
                includeComments: false,
            });

            expect(getIssue).toHaveBeenCalledTimes(1);
            const callArgs = getIssue.mock.calls[0][0];
            expect(callArgs.issueIdOrKey).toBe("PROJ-101");
            expect(callArgs.fields).not.toContain("*all");
            expect(callArgs.fields).not.toContain("comment");
            expect(callArgs.fields).not.toContain("epic");
            expect(callArgs.fields).not.toContain("epicLink");
            expect(callArgs.fields).toEqual(
                expect.arrayContaining([...ISSUE_DESCRIPTION_FIELDS]),
            );
            expect(getComments).not.toHaveBeenCalled();

            const text = result.content[0].text;
            expect(text).toContain("Issue: PROJ-101");
            expect(text).toContain("Summary: Compact issue fetch");
            expect(text).toContain("Labels: mcp, perf");
            expect(text).toContain("Detailed body");
            expect(text).toContain("Структура связанных задач");
            expect(text).not.toContain("Comments for PROJ-101");
        });

        it("does not include comments when includeComments is false even if commentsLimit is passed", async () => {
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-102",
                fields: {
                    summary: "No comments requested",
                    description: "Body",
                    issuetype: { name: "Task" },
                    status: { name: "Open" },
                },
            });
            const getComments = jest.fn();

            const handler = readDescriptionHandler(
                {
                    issues: { getIssue },
                    issueComments: { getComments },
                    issueSearch: { searchForIssuesUsingJql: jest.fn() },
                } as any,
                mockConfig,
            );

            const result = await handler({
                issueKey: "PROJ-102",
                includeComments: false,
                commentsLimit: 5,
            });

            expect(getIssue.mock.calls[0][0].fields).not.toContain("comment");
            expect(getComments).not.toHaveBeenCalled();
            expect(result.content[0].text).not.toContain("Comments for PROJ-102");
            expect(result.content[0].text).toContain(
                "Note: commentsLimit=5 was ignored because includeComments=false.",
            );
        });

        it("includes embedded comments in a single getIssue call and applies commentsLimit", async () => {
            const allComments = [1, 2, 3, 4, 5].map((i) => makeComment(i));
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-103",
                fields: {
                    summary: "Issue with comments",
                    description: "Main description",
                    issuetype: { name: "Bug" },
                    status: { name: "Open" },
                    comment: {
                        comments: allComments,
                        total: 5,
                        startAt: 0,
                        maxResults: 50,
                    },
                },
            });
            const getComments = jest.fn();

            const handler = readDescriptionHandler(
                {
                    issues: { getIssue },
                    issueComments: { getComments },
                    issueSearch: { searchForIssuesUsingJql: jest.fn() },
                } as any,
                mockConfig,
            );

            const result = await handler({
                issueKey: "PROJ-103",
                includeComments: true,
                commentsLimit: 2,
            });

            expect(getIssue).toHaveBeenCalledTimes(1);
            expect(getIssue.mock.calls[0][0].fields).toContain("comment");
            expect(getComments).not.toHaveBeenCalled();

            const text = result.content[0].text;
            expect(text).toContain(
                "Comments for PROJ-103 (showing last 2 of 5 total, 3 earlier skipped):",
            );
            expect(text).not.toContain("Comment #1");
            expect(text).not.toContain("Comment #3");
            expect(text).toContain("Comment #4");
            expect(text).toContain("Comment #5");
        });

        it("falls back to issueComments.getComments when embedded comments are paginated", async () => {
            const headComments = [1, 2].map((i) => makeComment(i));
            const tailComments = [4, 5].map((i) => makeComment(i));
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-104",
                fields: {
                    summary: "Paginated embedded comments",
                    description: "Body",
                    issuetype: { name: "Task" },
                    status: { name: "Open" },
                    comment: {
                        comments: headComments,
                        total: 5,
                        startAt: 0,
                        maxResults: 2,
                    },
                },
            });
            const getComments = jest.fn().mockResolvedValue({
                comments: tailComments,
                total: 5,
                startAt: 3,
                maxResults: 2,
            });

            const handler = readDescriptionHandler(
                {
                    issues: { getIssue },
                    issueComments: { getComments },
                    issueSearch: { searchForIssuesUsingJql: jest.fn() },
                } as any,
                mockConfig,
            );

            const result = await handler({
                issueKey: "PROJ-104",
                includeComments: true,
                commentsLimit: 2,
            });

            expect(getComments).toHaveBeenCalledWith({
                issueIdOrKey: "PROJ-104",
                startAt: 3,
                maxResults: 2,
            });
            const text = result.content[0].text;
            expect(text).toContain(
                "Comments for PROJ-104 (showing last 2 of 5 total, 3 earlier skipped):",
            );
            expect(text).toContain("Comment #4");
            expect(text).toContain("Comment #5");
            expect(text).not.toContain("Comment #1");
        });

        it("preserves description when secondary comment fallback fails", async () => {
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-105",
                fields: {
                    summary: "Resilient description",
                    description: "Must still be returned",
                    issuetype: { name: "Task" },
                    status: { name: "Open" },
                },
            });
            const getComments = jest
                .fn()
                .mockRejectedValue(new Error("Comments endpoint timeout"));

            const handler = readDescriptionHandler(
                {
                    issues: { getIssue },
                    issueComments: { getComments },
                    issueSearch: { searchForIssuesUsingJql: jest.fn() },
                } as any,
                mockConfig,
            );

            const result = await handler({
                issueKey: "PROJ-105",
                includeComments: true,
            });

            const text = result.content[0].text;
            expect(text).toContain("Must still be returned");
            expect(text).toContain(
                "Failed to retrieve comments: Comments endpoint timeout",
            );
        });

        it("renders empty comments notice when includeComments is true and issue has no comments", async () => {
            const getIssue = jest.fn().mockResolvedValue({
                key: "PROJ-106",
                fields: {
                    summary: "No comments yet",
                    description: "Body",
                    issuetype: { name: "Task" },
                    status: { name: "Open" },
                    comment: {
                        comments: [],
                        total: 0,
                        startAt: 0,
                        maxResults: 50,
                    },
                },
            });
            const getComments = jest.fn();

            const handler = readDescriptionHandler(
                {
                    issues: { getIssue },
                    issueComments: { getComments },
                    issueSearch: { searchForIssuesUsingJql: jest.fn() },
                } as any,
                mockConfig,
            );

            const result = await handler({
                issueKey: "PROJ-106",
                includeComments: true,
            });

            expect(getComments).not.toHaveBeenCalled();
            expect(result.content[0].text).toContain(
                "No comments found for issue PROJ-106",
            );
        });

        it("rejects empty issueKey and non-positive commentsLimit without calling Jira", async () => {
            const getIssue = jest.fn();
            const handler = readDescriptionHandler(
                { issues: { getIssue } } as any,
                mockConfig,
            );

            const emptyRes = await handler({ issueKey: "" });
            expect(emptyRes.content[0].text).toContain(
                "Cannot extract issue key",
            );

            const zeroLimitRes = await handler({
                issueKey: "PROJ-1",
                includeComments: true,
                commentsLimit: 0,
            });
            expect(zeroLimitRes.content[0].text).toContain(
                "commentsLimit must be a positive integer",
            );

            expect(getIssue).not.toHaveBeenCalled();
        });

        it("surfaces structured Jira API 404 errors without undefined message", async () => {
            const getIssue = jest.fn().mockRejectedValue({
                status: 404,
                response: {
                    errorMessages: ["Issue Does Not Exist"],
                    errors: {},
                },
            });
            const handler = readDescriptionHandler(
                { issues: { getIssue } } as any,
                mockConfig,
            );

            const res = await handler({ issueKey: "PROJ-404" });
            expect(res.content[0].text).toContain(
                "Failed to retrieve issue PROJ-404: HTTP 404: Issue Does Not Exist",
            );
        });
    });

    describe("readCommentsSchema & readCommentsHandler", () => {
        it("supports optional limit in schema", () => {
            expect(readCommentsSchema.limit.parse(undefined)).toBeUndefined();
            expect(readCommentsSchema.limit.parse(5)).toBe(5);
        });

        it("returns last N comments and skipped count when limit < total", async () => {
            const getComments = jest.fn().mockResolvedValue({
                comments: [1, 2, 3, 4].map((i) => makeComment(i)),
                total: 4,
                startAt: 0,
                maxResults: 50,
            });

            const handler = readCommentsHandler(
                { issueComments: { getComments } } as any,
                mockConfig,
            );
            const result = await handler({
                issueKey: "PROJ-200",
                limit: 2,
            });

            const text = result.content[0].text;
            expect(text).toContain(
                "Comments for PROJ-200 (showing last 2 of 4 total, 2 earlier skipped):",
            );
            expect(text).not.toContain("Comment #1");
            expect(text).not.toContain("Comment #2");
            expect(text).toContain("Comment #3");
            expect(text).toContain("Comment #4");
        });

        it("fetches tail page when Jira paginates comments and limit is set", async () => {
            const getComments = jest
                .fn()
                .mockResolvedValueOnce({
                    comments: [1, 2, 3].map((i) => makeComment(i)),
                    total: 10,
                    startAt: 0,
                    maxResults: 3,
                })
                .mockResolvedValueOnce({
                    comments: [9, 10].map((i) => makeComment(i)),
                    total: 10,
                    startAt: 8,
                    maxResults: 2,
                });

            const handler = readCommentsHandler(
                { issueComments: { getComments } } as any,
                mockConfig,
            );
            const result = await handler({
                issueKey: "https://jira.example.com/browse/proj-201",
                limit: 2,
            });

            expect(getComments).toHaveBeenNthCalledWith(1, {
                issueIdOrKey: "PROJ-201",
            });
            expect(getComments).toHaveBeenNthCalledWith(2, {
                issueIdOrKey: "PROJ-201",
                startAt: 8,
                maxResults: 2,
            });
            expect(result.content[0].text).toContain(
                "Comments for PROJ-201 (showing last 2 of 10 total, 8 earlier skipped):",
            );
            expect(result.content[0].text).toContain("Comment #9");
            expect(result.content[0].text).toContain("Comment #10");
        });

        it("caps tail pagination to one 50-comment page when limit is omitted on large issues", async () => {
            const firstBatch = Array.from({ length: 50 }, (_, idx) =>
                makeComment(idx + 1),
            );
            const tailBatch = Array.from({ length: 50 }, (_, idx) =>
                makeComment(idx + 201),
            );
            const getComments = jest
                .fn()
                .mockResolvedValueOnce({
                    comments: firstBatch,
                    total: 250,
                    startAt: 0,
                    maxResults: 50,
                })
                .mockResolvedValueOnce({
                    comments: tailBatch,
                    total: 250,
                    startAt: 200,
                    maxResults: 50,
                });

            const handler = readCommentsHandler(
                { issueComments: { getComments } } as any,
                mockConfig,
            );
            const result = await handler({ issueKey: "PROJ-250" });

            expect(getComments).toHaveBeenCalledTimes(2);
            expect(getComments).toHaveBeenNthCalledWith(2, {
                issueIdOrKey: "PROJ-250",
                startAt: 200,
                maxResults: 50,
            });
            const text = result.content[0].text;
            expect(text).toContain(
                "Comments for PROJ-250 (showing last 50 of 250 total, 200 earlier skipped):",
            );
            expect(text).toContain("Comment #250");
            expect(text).not.toContain("Comment #1\n");
        });

        it("handles empty comments and invalid inputs cleanly", async () => {
            const getComments = jest
                .fn()
                .mockResolvedValue({ comments: [], total: 0 });
            const handler = readCommentsHandler(
                { issueComments: { getComments } } as any,
                mockConfig,
            );

            const noComments = await handler({
                issueKey: "PROJ-202",
                limit: 5,
            });
            expect(noComments.content[0].text).toBe(
                "No comments found for issue PROJ-202",
            );

            getComments.mockClear();
            const badKey = await handler({ issueKey: "   " });
            expect(badKey.content[0].text).toContain(
                "Cannot extract issue key",
            );
            const badLimit = await handler({ issueKey: "PROJ-202", limit: -1 });
            expect(badLimit.content[0].text).toContain(
                "limit must be a positive integer",
            );
            expect(getComments).not.toHaveBeenCalled();
        });
    });

    describe("searchIssuesSchema & searchIssuesHandler", () => {
        it("defaults includeDescription to false in schema", () => {
            expect(
                searchIssuesSchema.includeDescription.parse(undefined),
            ).toBe(false);
        });

        it("omits description field and line by default and includes it when true", async () => {
            const searchForIssuesUsingJql = jest.fn().mockResolvedValue({
                issues: [
                    {
                        key: "PROJ-301",
                        fields: {
                            summary: "Search match",
                            description: "Long description text",
                            issuetype: { name: "Bug" },
                            priority: { name: "High" },
                            status: { name: "Open" },
                            project: { key: "PROJ" },
                            created: "2026-01-01T10:00:00.000+0000",
                            updated: "2026-01-02T10:00:00.000+0000",
                        },
                    },
                ],
                total: 1,
                startAt: 0,
                maxResults: 20,
            });

            const handler = searchIssuesHandler(
                { issueSearch: { searchForIssuesUsingJql } } as any,
                mockConfig,
            );

            const compactRes = await handler({
                query: "Search",
                maxResults: 20,
                includeDescription: undefined as any,
            });
            expect(
                searchForIssuesUsingJql.mock.calls[0][0].fields,
            ).not.toContain("description");
            expect(compactRes.content[0].text).toContain(
                "1. PROJ-301: Search match",
            );
            expect(compactRes.content[0].text).not.toContain("Description:");

            const fullRes = await handler({
                query: "Search",
                maxResults: 20,
                includeDescription: true,
            });
            expect(searchForIssuesUsingJql.mock.calls[1][0].fields).toContain(
                "description",
            );
            expect(fullRes.content[0].text).toContain(
                "Description: Long description text",
            );
        });

        it("rejects empty search query without calling Jira", async () => {
            const searchForIssuesUsingJql = jest.fn();
            const handler = searchIssuesHandler(
                { issueSearch: { searchForIssuesUsingJql } } as any,
                mockConfig,
            );

            const result = await handler({
                query: "   ",
                maxResults: 20,
                includeDescription: false,
            });
            expect(searchForIssuesUsingJql).not.toHaveBeenCalled();
            expect(result.content[0].text).toContain(
                "Search query must not be empty",
            );
        });
    });
});
