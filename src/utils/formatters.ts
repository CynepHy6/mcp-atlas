// Форматирование результатов для различных типов ответов

export interface JiraIssue {
    key: string;
    fields: {
        summary?: string;
        description?: string;
        issuetype?: { name: string };
        priority?: { name: string };
        status?: { name: string };
        labels?: string[];
        assignee?: { displayName: string };
        creator?: { displayName: string };
        project?: { key: string };
        timetracking?: {
            originalEstimate?: string;
            remainingEstimate?: string;
            timeSpent?: string;
        };
        timeoriginalestimate?: number | null;
        timeestimate?: number | null;
        timespent?: number | null;
        created: string;
        updated: string;
    };
}

export interface SearchResponse {
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
}

export function formatSearchResults(
    searchResponse: SearchResponse,
    query: string,
    jiraHost: string,
    includeDescription: boolean = true
): string {
    if (!searchResponse.issues || searchResponse.issues.length === 0) {
        return `No issues found for query: "${query}"`;
    }

    const results: string[] = [
        `Found ${searchResponse.issues.length} issues for query: "${query}"`,
        `(showing ${searchResponse.issues.length} of ${searchResponse.total} total)`,
        "",
    ];

    searchResponse.issues.forEach((issue, index) => {
        const summary = issue.fields.summary || "No summary";
        const description =
            issue.fields.description || "No description available";
        const issueType = issue.fields.issuetype?.name || "Unknown type";
        const priority = issue.fields.priority?.name || "No priority";
        const status = issue.fields.status?.name || "Unknown status";
        const assignee = issue.fields.assignee?.displayName || "Unassigned";
        const project = issue.fields.project?.key || "Unknown project";
        const created = new Date(issue.fields.created).toLocaleDateString();
        const updated = new Date(issue.fields.updated).toLocaleDateString();

        results.push(`${index + 1}. ${issue.key}: ${summary}`);
        results.push(
            `   Type: ${issueType} | Priority: ${priority} | Status: ${status}`
        );
        results.push(`   Project: ${project} | Assignee: ${assignee}`);
        results.push(`   Created: ${created} | Updated: ${updated}`);
        results.push(`   URL: ${jiraHost}/browse/${issue.key}`);

        if (includeDescription) {
            const truncatedDescription =
                description.length > 300
                    ? description.substring(0, 300) + "..."
                    : description;
            results.push(`   Description: ${truncatedDescription}`);
        }

        results.push("");
    });

    return results.join("\n");
}

export function formatIssueDescription(issue: JiraIssue): string {
    const description = issue.fields.description || "No description available";
    const summary = issue.fields.summary || "No summary available";
    const status = issue.fields.status?.name || "Unknown status";
    const issueType = issue.fields.issuetype?.name || "Unknown type";
    const timeTrackingBlock = formatTimeTracking(issue);

    const resultLines = [
        `Issue: ${issue.key}`,
        `Summary: ${summary}`,
        `Type: ${issueType}`,
        `Status: ${status}`,
        `Labels: ${formatLabels(issue.fields.labels)}`,
    ];

    if (timeTrackingBlock) {
        resultLines.push("", "Time Tracking:", timeTrackingBlock);
    }

    resultLines.push(`\nDescription:\n${description}`);

    return resultLines.join("\n");
}

function formatLabels(labels: string[] | undefined): string {
    if (!labels || labels.length === 0) {
        return "(none)";
    }

    return labels.join(", ");
}

function formatTimeTracking(issue: JiraIssue): string | null {
    const originalEstimate =
        issue.fields.timetracking?.originalEstimate ||
        formatSecondsToDuration(issue.fields.timeoriginalestimate);
    const remainingEstimate =
        issue.fields.timetracking?.remainingEstimate ||
        formatSecondsToDuration(issue.fields.timeestimate);
    const timeSpent =
        issue.fields.timetracking?.timeSpent ||
        formatSecondsToDuration(issue.fields.timespent);

    const trackingLines: string[] = [];

    if (originalEstimate) {
        trackingLines.push(`- Original Estimate: ${originalEstimate}`);
    }
    if (remainingEstimate) {
        trackingLines.push(`- Remaining Estimate: ${remainingEstimate}`);
    }
    if (timeSpent) {
        trackingLines.push(`- Time Spent: ${timeSpent}`);
    }

    return trackingLines.length > 0 ? trackingLines.join("\n") : null;
}

function formatSecondsToDuration(durationSeconds?: number | null): string | null {
    if (
        typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0
    ) {
        return null;
    }

    if (durationSeconds === 0) {
        return "0m";
    }

    const totalMinutes = Math.floor(durationSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 8);

    const remainingHours = totalHours % 8;
    const remainingMinutes = totalMinutes % 60;
    const durationParts: string[] = [];

    if (totalDays > 0) {
        durationParts.push(`${totalDays}d`);
    }
    if (remainingHours > 0) {
        durationParts.push(`${remainingHours}h`);
    }
    if (remainingMinutes > 0) {
        durationParts.push(`${remainingMinutes}m`);
    }

    return durationParts.join(" ");
}

export interface Comment {
    id: string;
    author?: { displayName: string };
    body: string;
    created: string;
    updated: string;
}

export function formatComments(issueKey: string, comments: Comment[]): string {
    if (!comments || comments.length === 0) {
        return `No comments found for issue ${issueKey}`;
    }

    const formattedComments = comments.map((comment: Comment) => {
        const author = comment.author?.displayName || "Unknown";
        const created = new Date(comment.created).toLocaleString();
        const body = comment.body || "No content";

        return [
            `Id: ${comment.id}`,
            `Author: ${author}`,
            `Date: ${created}`,
            `Comment:\n${body}`,
            "---",
        ].join("\n");
    });

    return `Comments for ${issueKey}:\n\n${formattedComments.join("\n")}`;
}
