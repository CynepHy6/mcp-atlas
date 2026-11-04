import { z } from "zod";
import { formatDuration, getDateRangeByDays } from "../../utils/date-utils.js";
import { validateJiraConfig } from "../../utils/validation.js";
export const getWorklogsByDaysSchema = {
    days: z
        .number()
        .positive()
        .describe("Number of days to look backward from end date (e.g. 180 for ~6 months, 30 for ~1 month)"),
    endDate: z
        .string()
        .optional()
        .describe("End date in YYYY-MM-DD format. If not specified, uses current date"),
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
export const getWorklogsByDaysHandler = (jira, jiraConfig) => async ({ days, endDate, username, projectKeys, includeSubtasks, includeCommunication, communicationProjects, }) => {
    const { startDate: calculatedStartDate, endDate: calculatedEndDate } = getDateRangeByDays(days, endDate);
    // Call the main get-worklogs function with calculated dates
    const configError = validateJiraConfig(jiraConfig);
    if (configError) {
        return {
            content: [
                {
                    type: "text",
                    text: `Configuration error: ${configError}`,
                },
            ],
        };
    }
    try {
        let jqlUserFilter = username
            ? `worklogAuthor = "${username}"`
            : "worklogAuthor = currentUser()";
        let jqlProjectFilter = "";
        if (projectKeys && projectKeys.length > 0) {
            jqlProjectFilter = ` AND project in (${projectKeys
                .map((key) => `"${key}"`)
                .join(", ")})`;
        }
        let jqlCommunicationFilter = "";
        if (!includeCommunication && communicationProjects.length > 0) {
            jqlCommunicationFilter = ` AND project not in (${communicationProjects
                .map((key) => `"${key}"`)
                .join(", ")})`;
        }
        // Исключаем коммуникационные подзадачи (обсуждения, код-ревью)
        jqlCommunicationFilter += ` AND summary !~ "communications"`;
        const jqlQuery = `worklogDate >= "${calculatedStartDate}" AND worklogDate <= "${calculatedEndDate}" AND ${jqlUserFilter}${jqlProjectFilter}${jqlCommunicationFilter}`;
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
        for (const issue of searchResults.issues || []) {
            if (processedIssues.has(issue.key))
                continue;
            processedIssues.add(issue.key);
            const worklogsResponse = await jira.issueWorklogs.getIssueWorklog({
                issueIdOrKey: issue.key,
            });
            const targetUsername = username || "current user";
            const userWorklogs = worklogsResponse.worklogs?.filter((worklog) => {
                const worklogDate = new Date(worklog.started);
                const start = new Date(calculatedStartDate);
                const end = new Date(calculatedEndDate);
                return ((worklog.author.name === username ||
                    worklog.author.accountId === username ||
                    !username) &&
                    worklogDate >= start &&
                    worklogDate <= end);
            });
            if (userWorklogs && userWorklogs.length > 0) {
                const totalTimeSpent = userWorklogs.reduce((sum, wl) => sum + wl.timeSpentSeconds, 0);
                const result = {
                    key: issue.key,
                    summary: issue.fields.summary,
                    description: issue.fields.description?.substring(0, 500) ||
                        "No description",
                    url: `${jiraConfig.host}/browse/${issue.key}`,
                    type: issue.fields.issuetype?.name || "Unknown",
                    priority: issue.fields.priority?.name || "No Priority",
                    status: issue.fields.status?.name || "Unknown",
                    project: issue.fields.project?.key || "Unknown",
                    totalTimeSpent: formatDuration(totalTimeSpent),
                    worklogs: userWorklogs.map((wl) => ({
                        date: wl.started.split("T")[0],
                        timeSpent: formatDuration(wl.timeSpentSeconds),
                        comment: wl.comment || "No comment",
                    })),
                };
                const isCommTask = communicationProjects.some((proj) => issue.key.startsWith(`${proj}-`));
                if (isCommTask) {
                    communicationTasks.push(result);
                }
                else {
                    results.push(result);
                }
            }
        }
        const totalProjectTime = results.reduce((sum, result) => {
            result.worklogs.forEach((wl) => {
                const match = wl.timeSpent.match(/(\d+)d|(\d+)h|(\d+)m/g);
                if (match) {
                    match.forEach((m) => {
                        if (m.includes("d"))
                            sum += parseInt(m) * 8 * 3600;
                        else if (m.includes("h"))
                            sum += parseInt(m) * 3600;
                        else if (m.includes("m"))
                            sum += parseInt(m) * 60;
                    });
                }
            });
            return sum;
        }, 0);
        const totalCommTime = communicationTasks.reduce((sum, result) => {
            result.worklogs.forEach((wl) => {
                const match = wl.timeSpent.match(/(\d+)d|(\d+)h|(\d+)m/g);
                if (match) {
                    match.forEach((m) => {
                        if (m.includes("d"))
                            sum += parseInt(m) * 8 * 3600;
                        else if (m.includes("h"))
                            sum += parseInt(m) * 3600;
                        else if (m.includes("m"))
                            sum += parseInt(m) * 60;
                    });
                }
            });
            return sum;
        }, 0);
        const userDisplayName = username || "your";
        const reportTitle = username
            ? `Worklog Report for ${username}`
            : `Your Worklog Report`;
        let report = `${reportTitle}\n`;
        report += `Period: ${calculatedStartDate} to ${calculatedEndDate} (${days} days)\n`;
        report += `Total tasks: ${results.length + communicationTasks.length} (${results.length} project`;
        if (communicationTasks.length > 0) {
            report += ` + ${communicationTasks.length} communication`;
        }
        report += `)\n`;
        report += `Total time: ${formatDuration(totalProjectTime + totalCommTime)}\n`;
        report += `  - Project work: ${formatDuration(totalProjectTime)}\n`;
        if (totalCommTime > 0) {
            report += `  - Communication: ${formatDuration(totalCommTime)}\n`;
        }
        if (results.length > 0) {
            const projects = [...new Set(results.map((r) => r.project))];
            const taskTypes = [...new Set(results.map((r) => r.type))];
            report += `Projects: ${projects.join(", ")}\n`;
            report += `Task types: ${taskTypes.join(", ")}\n`;
        }
        if (!includeCommunication && communicationTasks.length > 0) {
            report += `\nNote: Communication tasks (${communicationProjects.join(", ")}) are excluded by default\n`;
            report += `To include them, set includeCommunication to true\n`;
        }
        if (results.length > 0) {
            report += `\nPROJECT TASKS:\n${"=".repeat(50)}\n\n`;
            results.forEach((result, index) => {
                report += `${index + 1}. ${result.key}: ${result.summary}\n`;
                report += `   Type: ${result.type} | Priority: ${result.priority} | Status: ${result.status}\n`;
                report += `   Project: ${result.project} | Time spent: ${result.totalTimeSpent}\n`;
                report += `   URL: ${result.url}\n`;
                report += `   Description: ${result.description}\n`;
                report += `   Worklogs (${result.worklogs.length}):\n`;
                result.worklogs.forEach((wl) => {
                    report += `     - ${wl.date}: ${wl.timeSpent}`;
                    if (wl.comment && wl.comment !== "No comment") {
                        report += ` (${wl.comment})`;
                    }
                    report += `\n`;
                });
                report += `\n`;
            });
        }
        if (includeCommunication && communicationTasks.length > 0) {
            report += `\nCOMMUNICATION TASKS:\n${"=".repeat(50)}\n\n`;
            communicationTasks.forEach((result, index) => {
                report += `${index + 1}. ${result.key}: ${result.summary}\n`;
                report += `   Time spent: ${result.totalTimeSpent}\n`;
                report += `   Worklogs (${result.worklogs.length}):\n`;
                result.worklogs.forEach((wl) => {
                    report += `     - ${wl.date}: ${wl.timeSpent}`;
                    if (wl.comment && wl.comment !== "No comment") {
                        report += ` (${wl.comment})`;
                    }
                    report += `\n`;
                });
                report += `\n`;
            });
        }
        return {
            content: [
                {
                    type: "text",
                    text: report,
                },
            ],
        };
    }
    catch (error) {
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
