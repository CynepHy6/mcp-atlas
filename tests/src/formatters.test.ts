// Тесты реальных функций форматирования из src/formatters.ts

import {
    formatComments,
    formatIssueDescription,
    formatSearchResults,
    type Comment,
    type JiraIssue,
    type SearchResponse,
} from "../../src/utils/formatters.js";

describe("Formatters", () => {
    const JIRA_HOST = "https://test-jira.example.com";

    describe("formatSearchResults", () => {
        it("should format search results correctly", () => {
            const mockResponse: SearchResponse = {
                issues: [
                    {
                        key: "VIM-123",
                        fields: {
                            summary: "Test issue",
                            description: "Test description",
                            issuetype: { name: "Bug" },
                            priority: { name: "High" },
                            status: { name: "Open" },
                            assignee: { displayName: "John Doe" },
                            creator: { displayName: "Jane Smith" },
                            project: { key: "VIM" },
                            created: "2025-01-01T12:00:00.000+0000",
                            updated: "2025-01-02T14:00:00.000+0000",
                        },
                    },
                ],
                total: 1,
                startAt: 0,
                maxResults: 50,
            };

            const formatted = formatSearchResults(
                mockResponse,
                "test",
                JIRA_HOST
            );

            expect(formatted).toContain('Found 1 issues for query: "test"');
            expect(formatted).toContain("(showing 1 of 1 total)");
            expect(formatted).toContain("1. VIM-123: Test issue");
            expect(formatted).toContain(
                "Type: Bug | Priority: High | Status: Open"
            );
            expect(formatted).toContain("Project: VIM | Assignee: John Doe");
            expect(formatted).toContain(`URL: ${JIRA_HOST}/browse/VIM-123`);
            expect(formatted).toContain("Description: Test description");
        });

        it("should handle empty results", () => {
            const emptyResponse: SearchResponse = {
                issues: [],
                total: 0,
                startAt: 0,
                maxResults: 50,
            };

            const formatted = formatSearchResults(
                emptyResponse,
                "nonexistent",
                JIRA_HOST
            );
            expect(formatted).toBe('No issues found for query: "nonexistent"');
        });

        it("should handle missing fields gracefully", () => {
            const mockResponse: SearchResponse = {
                issues: [
                    {
                        key: "VIM-124",
                        fields: {
                            created: "2025-01-01T12:00:00.000+0000",
                            updated: "2025-01-02T14:00:00.000+0000",
                        },
                    },
                ],
                total: 1,
                startAt: 0,
                maxResults: 50,
            };

            const formatted = formatSearchResults(
                mockResponse,
                "test",
                JIRA_HOST
            );

            expect(formatted).toContain("VIM-124: No summary");
            expect(formatted).toContain("Type: Unknown type");
            expect(formatted).toContain("Priority: No priority");
            expect(formatted).toContain("Status: Unknown status");
            expect(formatted).toContain("Assignee: Unassigned");
            expect(formatted).toContain("Project: Unknown project");
        });

        it("should truncate long descriptions", () => {
            const longDescription = "A".repeat(400);
            const mockResponse: SearchResponse = {
                issues: [
                    {
                        key: "VIM-125",
                        fields: {
                            summary: "Test issue",
                            description: longDescription,
                            created: "2025-01-01T12:00:00.000+0000",
                            updated: "2025-01-02T14:00:00.000+0000",
                        },
                    },
                ],
                total: 1,
                startAt: 0,
                maxResults: 50,
            };

            const formatted = formatSearchResults(
                mockResponse,
                "test",
                JIRA_HOST,
                true
            );
            expect(formatted).toContain("A".repeat(300) + "...");
        });

        it("should exclude description when requested", () => {
            const mockResponse: SearchResponse = {
                issues: [
                    {
                        key: "VIM-126",
                        fields: {
                            summary: "Test issue",
                            description: "This should not appear",
                            created: "2025-01-01T12:00:00.000+0000",
                            updated: "2025-01-02T14:00:00.000+0000",
                        },
                    },
                ],
                total: 1,
                startAt: 0,
                maxResults: 50,
            };

            const formatted = formatSearchResults(
                mockResponse,
                "test",
                JIRA_HOST,
                false
            );
            expect(formatted).not.toContain("Description:");
            expect(formatted).not.toContain("This should not appear");
        });
    });

    describe("formatIssueDescription", () => {
        it("should format issue description correctly", () => {
            const issue: JiraIssue = {
                key: "VIM-26407",
                fields: {
                    summary: "П отмечают рекординг как uncheckable",
                    description: "Подробное описание проблемы с рекордингом...",
                    issuetype: { name: "Задача" },
                    status: { name: "Ready for Development" },
                    created: "2024-12-24T10:00:00.000+0000",
                    updated: "2025-09-03T15:30:00.000+0000",
                },
            };

            const formatted = formatIssueDescription(issue);

            expect(formatted).toContain("Issue: VIM-26407");
            expect(formatted).toContain(
                "Summary: П отмечают рекординг как uncheckable"
            );
            expect(formatted).toContain("Type: Задача");
            expect(formatted).toContain("Status: Ready for Development");
            expect(formatted).toContain(
                "Description:\nПодробное описание проблемы с рекордингом..."
            );
        });

        it("should handle missing fields", () => {
            const issue: JiraIssue = {
                key: "VIM-000",
                fields: {
                    created: "2025-01-01T12:00:00.000+0000",
                    updated: "2025-01-02T14:00:00.000+0000",
                },
            };

            const formatted = formatIssueDescription(issue);

            expect(formatted).toContain("Issue: VIM-000");
            expect(formatted).toContain("Summary: No summary available");
            expect(formatted).toContain("Type: Unknown type");
            expect(formatted).toContain("Status: Unknown status");
            expect(formatted).toContain(
                "Description:\nNo description available"
            );
        });

        it("should include time tracking when available", () => {
            const issue: JiraIssue = {
                key: "VIM-777",
                fields: {
                    summary: "Задача с оценками",
                    description: "Описание",
                    issuetype: { name: "Задача" },
                    status: { name: "In Progress" },
                    timetracking: {
                        originalEstimate: "3d 4h",
                        remainingEstimate: "1d 2h",
                        timeSpent: "2d 2h",
                    },
                    created: "2025-01-01T12:00:00.000+0000",
                    updated: "2025-01-02T14:00:00.000+0000",
                },
            };

            const formatted = formatIssueDescription(issue);

            expect(formatted).toContain("Time Tracking:");
            expect(formatted).toContain("Original Estimate: 3d 4h");
            expect(formatted).toContain("Remaining Estimate: 1d 2h");
            expect(formatted).toContain("Time Spent: 2d 2h");
        });

        it("should fallback to seconds-based time tracking fields", () => {
            const issue: JiraIssue = {
                key: "VIM-778",
                fields: {
                    summary: "Задача с time fields",
                    description: "Описание",
                    issuetype: { name: "Задача" },
                    status: { name: "In Progress" },
                    timeoriginalestimate: 3600,
                    timeestimate: 1800,
                    timespent: 28800,
                    created: "2025-01-01T12:00:00.000+0000",
                    updated: "2025-01-02T14:00:00.000+0000",
                },
            };

            const formatted = formatIssueDescription(issue);

            expect(formatted).toContain("Original Estimate: 1h");
            expect(formatted).toContain("Remaining Estimate: 30m");
            expect(formatted).toContain("Time Spent: 1d");
        });
    });

    describe("formatComments", () => {
        it("should format comments correctly", () => {
            const comments: Comment[] = [
                {
                    id: "12345",
                    author: { displayName: "Test User" },
                    body: "Тестовый комментарий к задаче",
                    created: "2025-01-01T10:00:00.000+0000",
                    updated: "2025-01-01T10:00:00.000+0000",
                },
                {
                    id: "12346",
                    author: { displayName: "Another User" },
                    body: "Еще один комментарий",
                    created: "2025-01-02T11:00:00.000+0000",
                    updated: "2025-01-02T11:00:00.000+0000",
                },
            ];

            const formatted = formatComments("VIM-26407", comments);

            expect(formatted).toContain("Comments for VIM-26407:");
            expect(formatted).toContain("Id: 12345");
            expect(formatted).toContain("Id: 12346");
            expect(formatted).toContain("Author: Test User");
            expect(formatted).toContain("Author: Another User");
            expect(formatted).toContain("Тестовый комментарий к задаче");
            expect(formatted).toContain("Еще один комментарий");
            expect(formatted).toContain("---");
        });

        it("should handle empty comments", () => {
            const formatted = formatComments("VIM-12345", []);
            expect(formatted).toBe("No comments found for issue VIM-12345");
        });

        it("should handle missing author", () => {
            const comments: Comment[] = [
                {
                    id: "12347",
                    body: "Комментарий без автора",
                    created: "2025-01-01T10:00:00.000+0000",
                    updated: "2025-01-01T10:00:00.000+0000",
                },
            ];

            const formatted = formatComments("VIM-12345", comments);
            expect(formatted).toContain("Author: Unknown");
            expect(formatted).toContain("Комментарий без автора");
        });

        it("should handle missing body", () => {
            const comments: Comment[] = [
                {
                    id: "12348",
                    author: { displayName: "Test User" },
                    body: "",
                    created: "2025-01-01T10:00:00.000+0000",
                    updated: "2025-01-01T10:00:00.000+0000",
                },
            ];

            const formatted = formatComments("VIM-12345", comments);
            expect(formatted).toContain("Author: Test User");
            expect(formatted).toContain("Comment:\nNo content");
        });
    });
});
