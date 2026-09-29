import { z } from "zod";
export const zephyrStepSchema = z.object({
    description: z
        .string()
        .describe("Step action. HTML <br /> is allowed for line breaks."),
    testData: z.string().optional(),
    expectedResult: z.string().optional(),
});
export const zephyrUpsertFieldsSchema = {
    name: z
        .string()
        .optional()
        .describe("Test case title in Zephyr. If omitted with wdioItTitle, parsed from it() without #KEY suffix."),
    wdioItTitle: z
        .string()
        .optional()
        .describe('Full test-wdio it() title. Example: "Payment banner is visible #PROJ-T123". If it ends with #PREFIX-Tnnn → update that case; otherwise create a new one.'),
    objective: z
        .string()
        .optional()
        .describe("Objective / high-level description shown in Zephyr."),
    precondition: z
        .string()
        .optional()
        .describe("Preconditions. Prefer multiline numbered list; HTML <br /> is allowed."),
    testScriptPlainText: z
        .string()
        .optional()
        .describe("Manual-style steps for Zephyr (multiline). Use blocks like \"Шаг 1: ...\\n\\nОжидаемый результат: ...\". Converted to STEP_BY_STEP script."),
    steps: z
        .array(zephyrStepSchema)
        .optional()
        .describe("Structured step-by-step script. Prefer testScriptPlainText for test-wdio sync unless you already have structured steps."),
    folder: z.string().optional().describe("Zephyr folder path."),
    priority: z.string().optional(),
    status: z.string().optional(),
    customFields: z
        .record(z.string())
        .optional()
        .describe("Project-specific custom fields. On create, use inspect-zephyr-project or inheritCustomFieldsFrom when unsure."),
};
export const hasZephyrScriptInput = (input) => Boolean((input.testScriptPlainText &&
    input.testScriptPlainText.trim().length > 0) ||
    (input.steps && input.steps.length > 0));
export const mergeUpsertName = (explicitName, wdioItTitle) => {
    if (explicitName && explicitName.trim().length > 0) {
        return explicitName.trim();
    }
    if (wdioItTitle && wdioItTitle.trim().length > 0) {
        return parseWdioItTitle(wdioItTitle).name;
    }
    throw new Error("Provide name or wdioItTitle.");
};
export const parseWdioItTitle = (title) => {
    const trimmed = title.trim();
    const match = trimmed.match(/\s#([A-Z][A-Z0-9]+-T\d+)\s*$/i);
    if (!match) {
        return { name: trimmed };
    }
    return {
        testCaseKey: match[1].toUpperCase(),
        name: trimmed.replace(/\s#([A-Z][A-Z0-9]+-T\d+)\s*$/i, "").trim(),
    };
};
export const formatPlainTextAsZephyrSteps = (plainText) => {
    const normalized = plainText.trim();
    if (normalized.length === 0) {
        return [];
    }
    const stepBlocks = normalized
        .split(/\n(?=Шаг\s+\d+)/i)
        .map((block) => block.trim())
        .filter((block) => block.length > 0);
    const blocks = stepBlocks.length > 1 ? stepBlocks : [normalized];
    return blocks.map((block) => ({
        description: block.replace(/\r?\n/g, "<br />"),
    }));
};
export const resolveUpsertSteps = (input) => {
    if (input.steps && input.steps.length > 0) {
        return input.steps;
    }
    if (input.testScriptPlainText && input.testScriptPlainText.trim().length > 0) {
        return formatPlainTextAsZephyrSteps(input.testScriptPlainText);
    }
    return undefined;
};
export const collectProjectInspection = (projectKey, cases) => {
    const customFieldOptions = {};
    const folderExamples = new Set();
    for (const testCase of cases) {
        if (testCase.folder) {
            folderExamples.add(testCase.folder);
        }
        if (!testCase.customFields) {
            continue;
        }
        for (const [field, value] of Object.entries(testCase.customFields)) {
            if (!customFieldOptions[field]) {
                customFieldOptions[field] = new Set();
            }
            customFieldOptions[field].add(value);
        }
    }
    const serializedOptions = Object.fromEntries(Object.entries(customFieldOptions).map(([field, values]) => [
        field,
        [...values].sort(),
    ]));
    return {
        projectKey,
        sampleCases: cases.slice(0, 5),
        customFieldOptions: serializedOptions,
        folderExamples: [...folderExamples].slice(0, 8).sort(),
        automationStatusValues: serializedOptions["Automation status"] ??
            serializedOptions["Automation Status"] ??
            [],
    };
};
export const formatProjectInspection = (inspection, host) => {
    const lines = [
        `# Zephyr project inspection: ${inspection.projectKey}`,
        "",
        "Use this before creating new cases when custom fields or folders are unknown.",
        "",
        "## Observed custom field values",
    ];
    const fieldNames = Object.keys(inspection.customFieldOptions);
    if (fieldNames.length === 0) {
        lines.push("- No custom fields found in sample cases.");
    }
    else {
        for (const field of fieldNames.sort()) {
            lines.push(`- **${field}:** ${inspection.customFieldOptions[field].join(" | ")}`);
        }
    }
    lines.push("", "## Folder examples");
    if (inspection.folderExamples.length === 0) {
        lines.push("- No folders in sample cases.");
    }
    else {
        for (const folder of inspection.folderExamples) {
            lines.push(`- ${folder}`);
        }
    }
    lines.push("", "## Sample cases");
    if (inspection.sampleCases.length === 0) {
        lines.push("- No cases found.");
    }
    else {
        for (const testCase of inspection.sampleCases) {
            lines.push(`- ${testCase.key}: ${testCase.name ?? "Untitled"}`, `  URL: ${host.includes("://") ? host : `https://${host}`}/secure/Tests.jspa#/testCase/${testCase.key}`);
        }
    }
    lines.push("", "## test-wdio sync checklist", "1. Call upsert-zephyr-testcase with wdioItTitle + precondition + testScriptPlainText.", "2. If wdioItTitle ends with #PREFIX-Tnnn → existing case is updated.", "3. If there is no #suffix → a new case is created; append returned `#KEY-Tnnn` to the it() title.", "4. Match Automation status to reality: automated only when the wdio test already reports results to Zephyr.");
    return lines.join("\n");
};
export const formatUpsertResult = ({ action, testCase, host, wdioItTitle, }) => {
    const key = testCase.key ?? "unknown";
    const baseHost = host.includes("://") ? host : `https://${host}`;
    const lines = [
        `${action === "created" ? "Created" : "Updated"} Zephyr test case.`,
        `Key: ${key}`,
        `Project: ${testCase.projectKey}`,
        `URL: ${baseHost}/secure/Tests.jspa#/testCase/${key}`,
    ];
    if (action === "created") {
        const name = wdioItTitle !== undefined
            ? parseWdioItTitle(wdioItTitle).name
            : testCase.name;
        lines.push("", "Next step in test-wdio:", `\`it('${name} #${key}', async () => { ... });\``);
    }
    if (testCase.testScript?.steps && testCase.testScript.steps.length > 0) {
        lines.push("", "## Steps synced");
        testCase.testScript.steps.forEach((step, index) => {
            lines.push(`${index + 1}. ${step.description.replace(/<br \/>/g, "\n   ")}`);
        });
    }
    return lines.join("\n");
};
export const buildDefaultCustomFields = (inspection, overrides) => {
    if (overrides && Object.keys(overrides).length > 0) {
        return overrides;
    }
    const defaults = {};
    for (const [field, values] of Object.entries(inspection.customFieldOptions)) {
        if (values.length > 0) {
            defaults[field] = values[0];
        }
    }
    return Object.keys(defaults).length > 0 ? defaults : undefined;
};
export const fetchReferenceCustomFields = async (zephyr, referenceKey) => {
    const response = await zephyr.get(`/testcase/${referenceKey}`);
    return response.data.customFields;
};
