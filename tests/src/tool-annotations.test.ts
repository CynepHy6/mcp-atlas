// Аннотации MCP: у каждого зарегистрированного инструмента есть пометка, читающие помечены readOnlyHint.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TOOL_ANNOTATIONS, toolAnnotations } from "../../src/utils/tool-annotations.js";

const indexSource = readFileSync(join(__dirname, "../../src/index.ts"), "utf8");
const registered = [...indexSource.matchAll(/server\.tool\(\s*"([^"]+)",/g)].map(match => match[1]);
// Каждый вызов регистрации обязан начинаться с имени-литерала: иначе он выпал бы из сверки выше.
const registrations = indexSource.match(/server\.tool\(/g) ?? [];

describe("tool annotations", () => {
    it("covers every registered tool and nothing else", () => {
        expect(registered.length).toBeGreaterThan(0);
        expect(registered.length).toBe(registrations.length);
        expect([...registered].sort()).toEqual(Object.keys(TOOL_ANNOTATIONS).sort());
    });

    it("passes annotations to every registration", () => {
        const blocks = indexSource.split(/server\.tool\(/).slice(1);
        expect(blocks.length).toBe(registered.length);
        for (const block of blocks) {
            const name = /^\s*"([^"]+)",/.exec(block)?.[1];
            expect(block.split("\n);")[0]).toContain(`toolAnnotations("${name}")`);
        }
    });

    it("marks reads read-only and writes not read-only", () => {
        for (const name of ["read-description", "read-comments", "search-issues", "list-attachments", "get-confluence-page"]) {
            expect(toolAnnotations(name).readOnlyHint).toBe(true);
        }
        for (const name of ["create-issue", "edit-issue", "create-comment", "upload-attachment", "download-attachment"]) {
            expect(toolAnnotations(name).readOnlyHint).toBe(false);
        }
    });

    it("marks overwrites and deletions destructive, additive writes not", () => {
        const destructive = Object.entries(TOOL_ANNOTATIONS)
            .filter(([, annotations]) => annotations.destructiveHint)
            .map(([name]) => name)
            .sort();
        expect(destructive).toEqual([
            "delete-zephyr-folder",
            "delete-zephyr-testcase",
            "download-attachment",
            "edit-comment",
            "edit-confluence-page",
            "edit-issue",
            "update-zephyr-testcase",
            "upsert-zephyr-testcase",
        ]);
    });

    it("refuses an unknown tool", () => {
        expect(() => toolAnnotations("no-such-tool")).toThrow(/no-such-tool/);
    });
});
