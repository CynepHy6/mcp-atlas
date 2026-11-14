import {
    formatIssueStructure,
    getIssueStructure,
    ISSUE_STRUCTURE_FIELDS,
    type IssueStructure,
} from "../../src/utils/issue-relationships.js";

describe("issue relationships formatter", () => {
    it("should include issue links in formatted structure", () => {
        const structure: IssueStructure = {
            current: {
                key: "GRW-1813",
                summary: "Каталог П",
                status: "Inbox",
                type: "Эпик",
                url: "https://jira.example.com/browse/GRW-1813",
                priority: "Незначительный",
            },
            subtasks: [],
            siblings: [],
            epicStories: [],
            issueLinks: [
                {
                    key: "GRW-1834",
                    summary: "Навигация и переходы",
                    status: "In Progress",
                    type: "Задача",
                    url: "https://jira.example.com/browse/GRW-1834",
                    priority: "Средний",
                    relation: "blocks",
                    relationType: "Blocks",
                },
            ],
        };

        const formatted = formatIssueStructure(structure);

        expect(formatted).toContain("СВЯЗИ С ДРУГИМИ ЗАДАЧАМИ");
        expect(formatted).toContain("GRW-1834: Навигация и переходы");
        expect(formatted).toContain("**Связь:** blocks");
        expect(formatted).toContain("**Статус:** 🔄 In Progress | **Тип:** Задача");
    });

    it("should include epic stories when current issue is epic", () => {
        const structure: IssueStructure = {
            current: {
                key: "GRW-1813",
                summary: "Каталог П",
                status: "Inbox",
                type: "Эпик",
                url: "https://jira.example.com/browse/GRW-1813",
                priority: "Незначительный",
            },
            subtasks: [],
            siblings: [],
            epicStories: [
                {
                    key: "GRW-1822",
                    summary: "Создание раздела каталога П v2",
                    status: "Inbox",
                    type: "Задача",
                    url: "https://jira.example.com/browse/GRW-1822",
                    priority: "Незначительный",
                },
                {
                    key: "GRW-1823",
                    summary: "Отображение сертификатов П в карточке",
                    status: "Inbox",
                    type: "Задача",
                    url: "https://jira.example.com/browse/GRW-1823",
                    priority: "Незначительный",
                },
            ],
            issueLinks: [],
        };

        const formatted = formatIssueStructure(structure);

        expect(formatted).toContain("ЗАДАЧИ В ЭПИКЕ");
        expect(formatted).toContain("GRW-1822: Создание раздела каталога П v2");
        expect(formatted).toContain(
            "GRW-1823: Отображение сертификатов П в карточке"
        );
    });

    it("reuses prefetchedIssue without calling getIssue again and avoids *all on parent", async () => {
        const getIssue = jest.fn().mockResolvedValue({
            key: "PROJ-10",
            fields: {
                subtasks: [
                    {
                        key: "PROJ-11",
                        fields: {
                            summary: "Current subtask",
                            status: { name: "In Progress" },
                            issuetype: { name: "Sub-task" },
                        },
                    },
                    {
                        key: "PROJ-12",
                        fields: {
                            summary: "Sibling subtask",
                            status: { name: "Open" },
                            issuetype: { name: "Sub-task" },
                        },
                    },
                ],
            },
        });
        const jira = {
            issues: { getIssue },
            issueSearch: { searchForIssuesUsingJql: jest.fn() },
        } as any;

        const prefetched = {
            key: "PROJ-11",
            fields: {
                summary: "Current subtask",
                status: { name: "In Progress" },
                issuetype: { name: "Sub-task" },
                parent: {
                    key: "PROJ-10",
                    fields: {
                        summary: "Parent story",
                        status: { name: "In Progress" },
                        issuetype: { name: "Story" },
                    },
                },
            },
        };

        const structure = await getIssueStructure(
            jira,
            "PROJ-11",
            "https://jira.example.com",
            prefetched,
        );

        expect(getIssue).toHaveBeenCalledTimes(1);
        expect(getIssue.mock.calls[0][0].issueIdOrKey).toBe("PROJ-10");
        expect(getIssue.mock.calls[0][0].fields).not.toContain("*all");
        expect(structure.siblings).toHaveLength(1);
        expect(structure.siblings[0].key).toBe("PROJ-12");
    });

    it("requests targeted ISSUE_STRUCTURE_FIELDS instead of *all when prefetchedIssue is omitted", async () => {
        const getIssue = jest.fn().mockResolvedValue({
            key: "PROJ-20",
            fields: {
                summary: "Standalone task",
                status: { name: "Open" },
                issuetype: { name: "Task" },
            },
        });
        const jira = {
            issues: { getIssue },
            issueSearch: { searchForIssuesUsingJql: jest.fn() },
        } as any;

        await getIssueStructure(jira, "PROJ-20", "https://jira.example.com");

        expect(ISSUE_STRUCTURE_FIELDS).not.toContain("epic");
        expect(ISSUE_STRUCTURE_FIELDS).not.toContain("epicLink");
        expect(getIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-20",
            expand: ["parent", "subtasks", "issuelinks"],
            fields: [...ISSUE_STRUCTURE_FIELDS],
        });
    });
});
