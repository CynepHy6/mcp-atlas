export const resolveJiraHost = (host) => host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
export const buildZephyrTestCaseUrl = (host, testCaseKey) => `${resolveJiraHost(host)}/secure/Tests.jspa#/testCase/${testCaseKey}`;
export const buildZephyrProjectUrl = (host, projectId) => `${resolveJiraHost(host)}/secure/Tests.jspa#/v2/testCases?projectId=${projectId}`;
export const extractZephyrTestCaseKey = (value) => {
    const trimmed = value.trim();
    const hashMatch = trimmed.match(/#\/testCase\/([A-Z][A-Z0-9]+-T\d+)/i);
    if (hashMatch) {
        return hashMatch[1].toUpperCase();
    }
    const pathMatch = trimmed.match(/\/testCase\/([A-Z][A-Z0-9]+-T\d+)/i);
    if (pathMatch) {
        return pathMatch[1].toUpperCase();
    }
    const keyMatch = trimmed.match(/^([A-Z][A-Z0-9]+-T\d+)$/i);
    if (keyMatch) {
        return keyMatch[1].toUpperCase();
    }
    return trimmed;
};
export const buildTestCaseSearchQuery = ({ projectKey, projectId, text, }) => {
    const parts = [];
    if (projectKey) {
        parts.push(`projectKey = "${projectKey}"`);
    }
    if (text && text.trim().length > 0) {
        parts.push(`text ~ "${text.trim()}"`);
    }
    if (parts.length === 0 && projectId !== undefined) {
        throw new Error("projectId alone is not supported by Zephyr search. Resolve project key first or pass projectKey.");
    }
    return parts.join(" AND ");
};
export const formatZephyrTestCase = (testCase, host) => {
    const lines = [
        `# ${testCase.name}`,
        "",
        `**Key:** ${testCase.key ?? "n/a"}`,
        `**Project:** ${testCase.projectKey}`,
        `**Status:** ${testCase.status ?? "n/a"}`,
        `**Priority:** ${testCase.priority ?? "n/a"}`,
        `**Folder:** ${testCase.folder ?? "n/a"}`,
        `**URL:** ${testCase.key ? buildZephyrTestCaseUrl(host, testCase.key) : "n/a"}`,
    ];
    if (testCase.objective) {
        lines.push("", "## Objective", testCase.objective);
    }
    if (testCase.precondition) {
        lines.push("", "## Precondition", testCase.precondition);
    }
    if (testCase.customFields && Object.keys(testCase.customFields).length > 0) {
        lines.push("", "## Custom fields");
        for (const [name, value] of Object.entries(testCase.customFields)) {
            lines.push(`- **${name}:** ${value}`);
        }
    }
    if (testCase.testScript?.steps && testCase.testScript.steps.length > 0) {
        lines.push("", "## Steps");
        testCase.testScript.steps.forEach((step, index) => {
            lines.push(`${index + 1}. ${step.description}`);
            if (step.testData) {
                lines.push(`   - Test data: ${step.testData}`);
            }
            if (step.expectedResult) {
                lines.push(`   - Expected: ${step.expectedResult}`);
            }
        });
    }
    else if (testCase.testScript?.text) {
        lines.push("", "## Test script", testCase.testScript.text);
    }
    if (testCase.createdBy || testCase.updatedBy) {
        lines.push("", `**Created by:** ${testCase.createdBy ?? "n/a"} | **Updated by:** ${testCase.updatedBy ?? "n/a"}`);
    }
    return lines.join("\n");
};
export const formatZephyrTestCaseList = (items, host, queryLabel) => {
    if (items.length === 0) {
        return `No Zephyr test cases found for: ${queryLabel}`;
    }
    const lines = [
        `Found ${items.length} Zephyr test case(s) for: ${queryLabel}`,
        "",
    ];
    items.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.key}: ${item.name ?? "Untitled"}`, `   Project: ${item.projectKey ?? "n/a"} | Status: ${item.status ?? "n/a"}`, `   URL: ${buildZephyrTestCaseUrl(host, item.key)}`);
        if (item.customFields && Object.keys(item.customFields).length > 0) {
            const custom = Object.entries(item.customFields)
                .map(([name, value]) => `${name}=${value}`)
                .join(", ");
            lines.push(`   Custom fields: ${custom}`);
        }
        lines.push("");
    });
    return lines.join("\n").trimEnd();
};
export const formatFolderTree = (root, projectLabel) => {
    const lines = [
        `Zephyr folder tree for ${projectLabel} (projectId ${root.projectId}).`,
        `Total test cases in project: ${root.itemsCount ?? "n/a"}.`,
        "",
        "folderId | items | path",
        "(use the path for the testcase `folder` field; use folderId for delete-zephyr-folder)",
        "",
    ];
    const walk = (nodes, parentPath) => {
        const sorted = [...nodes].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        for (const node of sorted) {
            const path = `${parentPath}/${node.name}`;
            lines.push(`${node.id} | ${node.itemsCount ?? 0} | ${path}`);
            if (node.children && node.children.length > 0) {
                walk(node.children, path);
            }
        }
    };
    if (root.children && root.children.length > 0) {
        walk(root.children, "");
    }
    else {
        lines.push("(no folders in this project)");
    }
    return lines.join("\n");
};
export const formatAxiosError = (error) => {
    if (typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error
            .response === "object") {
        const response = error.response;
        const status = response?.status;
        const data = response?.data;
        if (typeof data === "object" && data !== null) {
            const messages = data.errorMessages;
            if (messages && messages.length > 0) {
                return `HTTP ${status ?? "error"}: ${messages.join("; ")}`;
            }
            const message = data.message;
            if (message) {
                return `HTTP ${status ?? "error"}: ${message}`;
            }
        }
        if (typeof data === "string" && data.length > 0) {
            return `HTTP ${status ?? "error"}: ${data.slice(0, 500)}`;
        }
    }
    return error.message;
};
export const buildCreateTestCasePayload = ({ projectKey, name, objective, precondition, priority, status, folder, customFields, steps, testScriptText, }) => {
    const payload = {
        projectKey,
        name,
    };
    if (objective)
        payload.objective = objective;
    if (precondition)
        payload.precondition = precondition;
    if (priority)
        payload.priority = priority;
    if (status)
        payload.status = status;
    if (folder)
        payload.folder = folder;
    if (customFields && Object.keys(customFields).length > 0) {
        payload.customFields = customFields;
    }
    if (steps && steps.length > 0) {
        payload.testScript = {
            type: "STEP_BY_STEP",
            steps,
        };
    }
    else if (testScriptText) {
        payload.testScript = {
            type: "PLAIN_TEXT",
            text: testScriptText,
        };
    }
    return payload;
};
