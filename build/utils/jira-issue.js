const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]+-\d+$/;
const BROWSE_KEY_RE = /\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)/;
export function extractIssueKey(keyOrUrl) {
    const trimmed = keyOrUrl.trim();
    if (!trimmed) {
        return null;
    }
    const browseMatch = trimmed.match(BROWSE_KEY_RE);
    if (browseMatch) {
        return browseMatch[1].toUpperCase();
    }
    if (ISSUE_KEY_RE.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    return null;
}
export function isSubtaskType(issueType) {
    const normalized = issueType.trim().toLowerCase();
    return (normalized === "sub-task" ||
        normalized === "subtask" ||
        normalized.includes("подзадач"));
}
export function buildIssueBrowseUrl(host, issueKey) {
    const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${cleanHost}/browse/${issueKey}`;
}
export function buildIssueUpdateFields(input) {
    const fields = {
        ...(input.additionalFields ?? {}),
    };
    if (input.summary !== undefined) {
        fields.summary = input.summary;
    }
    if (input.description !== undefined) {
        fields.description = input.description;
    }
    if (input.issueType !== undefined) {
        fields.issuetype = { name: input.issueType };
    }
    if (input.parentIssueKey !== undefined) {
        fields.parent = { key: input.parentIssueKey };
    }
    if (input.assignee !== undefined) {
        fields.assignee = { name: input.assignee };
    }
    if (input.priority !== undefined) {
        fields.priority = { name: input.priority };
    }
    if (input.labels !== undefined) {
        fields.labels = input.labels;
    }
    if (input.components !== undefined) {
        fields.components = input.components.map((name) => ({ name }));
    }
    if (input.dueDate !== undefined) {
        fields.duedate = input.dueDate;
    }
    return fields;
}
export function formatJiraError(error) {
    const err = error;
    const response = err.response;
    const payload = unwrapJiraErrorPayload(response);
    const parts = [];
    if (payload.errorMessages?.length) {
        parts.push(...payload.errorMessages);
    }
    if (payload.errors) {
        for (const [field, message] of Object.entries(payload.errors)) {
            parts.push(`${field}: ${message}`);
        }
    }
    if (parts.length > 0) {
        const status = err.status ??
            (isRecord(response) && typeof response.status === "number"
                ? response.status
                : undefined);
        return status
            ? `HTTP ${status}: ${parts.join("; ")}`
            : parts.join("; ");
    }
    if (payload.message) {
        return payload.message;
    }
    return err.message || "Unknown error";
}
function unwrapJiraErrorPayload(response) {
    if (!isRecord(response)) {
        return {};
    }
    if (isRecord(response.data)) {
        return response.data;
    }
    return response;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
