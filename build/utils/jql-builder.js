// Построение JQL запросов для различных сценариев
export function buildSearchJQL(query, projectKeys, status, assignee) {
    let jqlQuery = `(summary ~ "${query}" OR description ~ "${query}")`;
    if (projectKeys && projectKeys.length > 0) {
        jqlQuery += ` AND project IN (${projectKeys
            .map((k) => `"${k}"`)
            .join(",")})`;
    }
    if (status && status.length > 0) {
        jqlQuery += ` AND status IN (${status.map((s) => `"${s}"`).join(",")})`;
    }
    if (assignee) {
        if (assignee === "currentUser()") {
            jqlQuery += ` AND assignee = currentUser()`;
        }
        else {
            jqlQuery += ` AND assignee = "${assignee}"`;
        }
    }
    jqlQuery += ` ORDER BY updated DESC`;
    return jqlQuery;
}
export function buildWorklogJQL(username, startDate, endDate, projectKeys, includeCommunication = false) {
    let jql = `worklogAuthor = "${username}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
    if (projectKeys && projectKeys.length > 0) {
        jql += ` AND project IN (${projectKeys
            .map((k) => `"${k}"`)
            .join(",")})`;
    }
    if (!includeCommunication) {
        jql += ` AND project NOT IN ("COM") AND issuetype != Sub-task AND summary !~ "communications"`;
    }
    return jql;
}
export function buildWorklogJQLForUser(username, startDate, endDate, projectKeys, includeCommunication = false) {
    const author = username || "currentUser()";
    return buildWorklogJQL(author, startDate, endDate, projectKeys, includeCommunication);
}
