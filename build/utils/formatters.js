// Форматирование результатов для различных типов ответов
export function formatSearchResults(searchResponse, query, jiraHost, includeDescription = true) {
    if (!searchResponse.issues || searchResponse.issues.length === 0) {
        return `No issues found for query: "${query}"`;
    }
    const results = [
        `Found ${searchResponse.issues.length} issues for query: "${query}"`,
        `(showing ${searchResponse.issues.length} of ${searchResponse.total} total)`,
        "",
    ];
    searchResponse.issues.forEach((issue, index) => {
        const summary = issue.fields.summary || "No summary";
        const description = issue.fields.description || "No description available";
        const issueType = issue.fields.issuetype?.name || "Unknown type";
        const priority = issue.fields.priority?.name || "No priority";
        const status = issue.fields.status?.name || "Unknown status";
        const assignee = issue.fields.assignee?.displayName || "Unassigned";
        const project = issue.fields.project?.key || "Unknown project";
        const created = new Date(issue.fields.created).toLocaleDateString();
        const updated = new Date(issue.fields.updated).toLocaleDateString();
        results.push(`${index + 1}. ${issue.key}: ${summary}`);
        results.push(`   Type: ${issueType} | Priority: ${priority} | Status: ${status}`);
        results.push(`   Project: ${project} | Assignee: ${assignee}`);
        results.push(`   Created: ${created} | Updated: ${updated}`);
        results.push(`   URL: ${jiraHost}/browse/${issue.key}`);
        if (includeDescription) {
            const truncatedDescription = description.length > 300
                ? description.substring(0, 300) + "..."
                : description;
            results.push(`   Description: ${truncatedDescription}`);
        }
        results.push("");
    });
    return results.join("\n");
}
export function formatIssueDescription(issue) {
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
    ];
    if (timeTrackingBlock) {
        resultLines.push("", "Time Tracking:", timeTrackingBlock);
    }
    resultLines.push(`\nDescription:\n${description}`);
    return resultLines.join("\n");
}
function formatTimeTracking(issue) {
    const originalEstimate = issue.fields.timetracking?.originalEstimate ||
        formatSecondsToDuration(issue.fields.timeoriginalestimate);
    const remainingEstimate = issue.fields.timetracking?.remainingEstimate ||
        formatSecondsToDuration(issue.fields.timeestimate);
    const timeSpent = issue.fields.timetracking?.timeSpent ||
        formatSecondsToDuration(issue.fields.timespent);
    const trackingLines = [];
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
function formatSecondsToDuration(durationSeconds) {
    if (typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0) {
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
    const durationParts = [];
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
export function formatComments(issueKey, comments) {
    if (!comments || comments.length === 0) {
        return `No comments found for issue ${issueKey}`;
    }
    const formattedComments = comments.map((comment) => {
        const author = comment.author?.displayName || "Unknown";
        const created = new Date(comment.created).toLocaleString();
        const body = comment.body || "No content";
        return [
            `Author: ${author}`,
            `Date: ${created}`,
            `Comment:\n${body}`,
            "---",
        ].join("\n");
    });
    return `Comments for ${issueKey}:\n\n${formattedComments.join("\n")}`;
}
