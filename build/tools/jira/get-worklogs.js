import { z } from "zod";
import { formatDuration } from "../../utils/date-utils.js";
import { buildWorklogJQL } from "../../utils/jql-builder.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getWorklogsSchema = {
    startDate: z.string().describe("Start date in YYYY-MM-DD format"),
    endDate: z.string().describe("End date in YYYY-MM-DD format"),
    username: z
        .string()
        .optional()
        .describe("Username to get worklogs for. If not specified, gets your own worklogs"),
    projectKeys: z
        .array(z.string())
        .optional()
        .describe("Filter by specific project keys (optional)"),
    includeSubtasks: z
        .boolean()
        .default(false)
        .describe("Include subtasks in results"),
    includeCommunication: z
        .boolean()
        .default(false)
        .describe("Include communication tasks (COM-* issues). Default: false"),
    communicationProjects: z
        .array(z.string())
        .default(["COM"])
        .describe("Project keys for communication tasks"),
};
export const getWorklogsHandler = (jira, jiraConfig) => async ({ startDate, endDate, username, projectKeys, includeSubtasks, includeCommunication, communicationProjects, }) => {
    const configError = validateJiraConfig(jiraConfig);
    if (configError) {
        return {
            content: [
                {
                    type: "text",
                    text: `Configuration error: ${configError}\n\nRequired environment variables:\n- JIRA_HOST: Your Jira instance host\n- JIRA_USERNAME: Your Jira username\n- JIRA_PASSWORD or JIRA_API_TOKEN: Your password or personal access token`,
                },
            ],
        };
    }
    try {
        let targetUser;
        let jqlUserFilter;
        if (username) {
            try {
                targetUser = await jira.users.getUser({
                    accountId: username,
                });
                jqlUserFilter = `worklogAuthor = "${username}"`;
            }
            catch (userError) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `User "${username}" not found or no permission to view their data`,
                        },
                    ],
                };
            }
        }
        else {
            targetUser = await jira.myself.getCurrentUser();
            jqlUserFilter = `worklogAuthor = currentUser()`;
        }
        const jqlQuery = buildWorklogJQL(username || "currentUser()", startDate, endDate, projectKeys, !includeCommunication);
        const searchResults = await jira.issueSearch.searchForIssuesUsingJql({
            jql: jqlQuery,
            fields: [
                "key",
                "summary",
                "description",
                "issuetype",
                "priority",
                "status",
                "assignee",
                "creator",
                "created",
                "updated",
                "project",
            ],
            maxResults: 1000,
            startAt: 0,
        });
        const results = [];
        const communicationTasks = [];
        const processedIssues = new Set();
        if (!searchResults.issues) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No issues found for the specified criteria",
                    },
                ],
            };
        }
        for (const issue of searchResults.issues) {
            if (processedIssues.has(issue.key))
                continue;
            processedIssues.add(issue.key);
            const worklogsResponse = await jira.issueWorklogs.getIssueWorklog({
                issueIdOrKey: issue.key,
            });
            const targetUsername = username ||
                targetUser?.name ||
                targetUser?.key ||
                targetUser?.accountId;
            const userWorklogs = worklogsResponse.worklogs?.filter((worklog) => {
                const worklogDate = new Date(worklog.started);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return ((worklog.author.name === targetUsername ||
                    worklog.author.key === targetUsername ||
                    worklog.author.accountId === targetUsername) &&
                    worklogDate >= start &&
                    worklogDate <= end);
            }) || [];
            if (userWorklogs.length > 0) {
                const totalTimeSpent = userWorklogs.reduce((sum, wl) => sum + wl.timeSpentSeconds, 0);
                const taskData = {
                    issue: {
                        key: issue.key,
                        summary: issue.fields.summary,
                        description: issue.fields.description ||
                            "No description available",
                        issueType: issue.fields.issuetype?.name,
                        priority: issue.fields.priority?.name,
                        status: issue.fields.status?.name,
                        assignee: issue.fields.assignee?.displayName,
                        creator: issue.fields.creator?.displayName,
                        project: issue.fields.project?.key,
                        created: issue.fields.created,
                        updated: issue.fields.updated,
                        url: `${jiraConfig.host}/browse/${issue.key}`,
                        isCommunication: communicationProjects.includes(issue.fields.project?.key),
                    },
                    worklogs: userWorklogs.map((wl) => ({
                        id: wl.id,
                        timeSpent: wl.timeSpent,
                        timeSpentSeconds: wl.timeSpentSeconds,
                        started: wl.started,
                        comment: wl.comment || "",
                        created: wl.created,
                        updated: wl.updated,
                    })),
                    totalTimeSpent: {
                        seconds: totalTimeSpent,
                        formatted: formatDuration(totalTimeSpent),
                    },
                };
                if (communicationProjects.includes(issue.fields.project?.key)) {
                    communicationTasks.push(taskData);
                }
                else {
                    results.push(taskData);
                }
            }
        }
        if (includeCommunication && communicationTasks.length > 0) {
            results.push(...communicationTasks);
        }
        results.sort((a, b) => b.totalTimeSpent.seconds - a.totalTimeSpent.seconds);
        const projectTasks = results.filter((r) => !r.issue.isCommunication);
        const commTasks = results.filter((r) => r.issue.isCommunication);
        const totalTime = results.reduce((sum, r) => sum + r.totalTimeSpent.seconds, 0);
        const projectTime = projectTasks.reduce((sum, r) => sum + r.totalTimeSpent.seconds, 0);
        const commTime = commTasks.reduce((sum, r) => sum + r.totalTimeSpent.seconds, 0);
        const userDisplayName = targetUser?.displayName ||
            targetUser?.name ||
            username ||
            "current user";
        const reportTitle = username
            ? `Worklog Report for ${userDisplayName} (${username})`
            : `Your Worklog Report`;
        const formattedResults = [
            reportTitle,
            `Period: ${startDate} to ${endDate}`,
            `Total tasks: ${results.length} (${projectTasks.length} project + ${commTasks.length} communication)`,
            `Total time: ${formatDuration(totalTime)}`,
            `  - Project work: ${formatDuration(projectTime)}`,
            `  - Communication: ${formatDuration(commTime)}`,
            `Projects: ${[...new Set(projectTasks.map((r) => r.issue.project))].join(", ") || "None"}`,
            `Task types: ${[...new Set(results.map((r) => r.issue.issueType))].join(", ") || "None"}`,
            "",
        ];
        if (!includeCommunication) {
            formattedResults.push(`Note: Communication tasks (${communicationProjects.join(", ")}) are excluded by default`);
            formattedResults.push(`To include them, set includeCommunication to true`);
            formattedResults.push("");
        }
        formattedResults.push("PROJECT TASKS:", "=".repeat(50));
        projectTasks.forEach((result, index) => {
            formattedResults.push(`\n${index + 1}. ${result.issue.key}: ${result.issue.summary}`, `   Type: ${result.issue.issueType} | Priority: ${result.issue.priority} | Status: ${result.issue.status}`, `   Project: ${result.issue.project} | Time spent: ${result.totalTimeSpent.formatted}`, `   URL: ${result.issue.url}`, `   Description: ${result.issue.description.substring(0, 200)}${result.issue.description.length > 200 ? "..." : ""}`, `   Worklogs (${result.worklogs.length}):`);
            result.worklogs.forEach((wl) => {
                const worklogDate = new Date(wl.started).toLocaleDateString();
                const comment = wl.comment
                    ? ` (${wl.comment.substring(0, 100)}${wl.comment.length > 100 ? "..." : ""})`
                    : "";
                formattedResults.push(`     - ${worklogDate}: ${wl.timeSpent}${comment}`);
            });
        });
        if (includeCommunication && commTasks.length > 0) {
            formattedResults.push("\n\nCOMMUNICATION TASKS:", "=".repeat(50));
            commTasks.forEach((result, index) => {
                formattedResults.push(`\n${index + 1}. ${result.issue.key}: ${result.issue.summary}`, `   Time spent: ${result.totalTimeSpent.formatted}`, `   Worklogs (${result.worklogs.length}):`);
                result.worklogs.forEach((wl) => {
                    const worklogDate = new Date(wl.started).toLocaleDateString();
                    const comment = wl.comment
                        ? ` (${wl.comment.substring(0, 150)}${wl.comment.length > 150 ? "..." : ""})`
                        : "";
                    formattedResults.push(`     - ${worklogDate}: ${wl.timeSpent}${comment}`);
                });
            });
        }
        else if (commTime > 0) {
            formattedResults.push(`\nCommunication time logged: ${formatDuration(commTime)} (excluded from detailed report)`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: formattedResults.join("\n"),
                },
            ],
        };
    }
    catch (error) {
        console.error("Error fetching worklogs:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve worklogs: ${error.message}`,
                },
            ],
        };
    }
};
