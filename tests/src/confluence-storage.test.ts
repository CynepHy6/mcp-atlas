import { confluenceStorageToMarkdown } from "../../src/utils/confluence-storage.js";

describe("confluenceStorageToMarkdown", () => {
    it("handles empty and whitespace-only input", () => {
        expect(confluenceStorageToMarkdown("")).toBe("");
        expect(confluenceStorageToMarkdown("   \n\t  ")).toBe("");
    });

    it("converts headings, paragraphs, inline formatting and strikethrough variants", () => {
        const xhtml = [
            "<h1>Technical Solution</h1>",
            "<p>Normal <strong>bold</strong>, <em>italic</em>, and <code>inline_code()</code>.</p>",
            "<p>Cancelled via s: <s>old requirement</s></p>",
            "<p>Cancelled via del: <del>dropped step</del></p>",
            "<p>Cancelled via span: <span style=\"color: gray; text-decoration: line-through;\">legacy API</span></p>",
            "<p>Nested strike: <s> <strong>bold</strong> cancelled </s>!</p>",
            "<p>Empty strike: <s>   </s>ok</p>",
        ].join("");

        const md = confluenceStorageToMarkdown(xhtml);
        expect(md).toContain("# Technical Solution");
        expect(md).toContain("Normal **bold**, *italic*, and `inline_code()`.");
        expect(md).toContain("Cancelled via s: ~~old requirement~~");
        expect(md).toContain("Cancelled via del: ~~dropped step~~");
        expect(md).toContain("Cancelled via span: ~~legacy API~~");
        expect(md).toContain("Nested strike:  ~~**bold** cancelled~~ !");
        expect(md).not.toContain("~~~~");
        expect(md).toContain("Empty strike:    ok");
    });

    it("converts Confluence code and noformat macros with CDATA", () => {
        const xhtml = `
            <ac:structured-macro ac:name="code" ac:schema-version="1">
                <ac:parameter ac:name="language">sql</ac:parameter>
                <ac:parameter ac:name="title">Migration query</ac:parameter>
                <ac:plain-text-body><![CDATA[SELECT id, name
FROM users
WHERE created_at < '2026-01-01' AND active = true;]]></ac:plain-text-body>
            </ac:structured-macro>
        `;

        const md = confluenceStorageToMarkdown(xhtml);
        expect(md).toContain("**Migration query**");
        expect(md).toContain("```sql\nSELECT id, name\nFROM users\nWHERE created_at < '2026-01-01' AND active = true;\n```");
        expect(md).not.toContain("ac:structured-macro");
    });

    it("converts nested lists and Confluence task lists", () => {
        const xhtml = `
            <ul>
                <li>First item<ul><li>Nested bullet</li></ul></li>
                <li>Second item</li>
            </ul>
            <ol start="3">
                <li>Step three</li>
                <li>Step four</li>
            </ol>
            <ac:task-list>
                <ac:task>
                    <ac:task-id>1</ac:task-id>
                    <ac:task-status>complete</ac:task-status>
                    <ac:task-body>Deploy backend</ac:task-body>
                </ac:task>
                <ac:task>
                    <ac:task-id>2</ac:task-id>
                    <ac:task-status>incomplete</ac:task-status>
                    <ac:task-body><s>Old rollout</s></ac:task-body>
                </ac:task>
            </ac:task-list>
        `;

        const md = confluenceStorageToMarkdown(xhtml);
        expect(md).toContain("- First item\n  - Nested bullet\n- Second item");
        expect(md).toContain("3. Step three\n4. Step four");
        expect(md).toContain("- [x] Deploy backend");
        expect(md).toContain("- [ ] ~~Old rollout~~");
    });

    it("converts tables while stripping colgroup noise and escaping pipes", () => {
        const xhtml = `
            <table class="wrapped">
                <colgroup><col /><col /></colgroup>
                <tbody>
                    <tr>
                        <th>Field</th>
                        <th>Behavior</th>
                    </tr>
                    <tr>
                        <td><p><code>includeComments</code></p></td>
                        <td><p>Default <code>false</code> | opt-in <s>true</s></p></td>
                    </tr>
                </tbody>
            </table>
        `;

        const md = confluenceStorageToMarkdown(xhtml);
        expect(md).toContain("| Field | Behavior |");
        expect(md).toContain("| --- | --- |");
        expect(md).toContain("| `includeComments` | Default `false` \\| opt-in ~~true~~ |");
        expect(md).not.toContain("<colgroup>");
    });

    it("converts links, ac:link references, jira/status/info/expand macros and strips toc", () => {
        const xhtml = `
            <ac:structured-macro ac:name="toc" />
            <p>See <a href="https://example.com/docs">API Docs</a> and <ac:structured-macro ac:name="jira"><ac:parameter ac:name="server">System Jira</ac:parameter><ac:parameter ac:name="key">PROJ-42</ac:parameter></ac:structured-macro> <ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Green</ac:parameter><ac:parameter ac:name="title">READY</ac:parameter></ac:structured-macro>.</p>
            <p>Page ref: <ac:link><ri:page ri:space-key="ENG" ri:content-title="Architecture" /><ac:plain-text-link-body><![CDATA[Arch Doc]]></ac:plain-text-link-body></ac:link> and <ac:link><ri:page ri:space-key="ENG" ri:content-title="System Overview" /></ac:link> by <ac:link><ri:user ri:username="jdoe" /></ac:link></p>
            <ac:structured-macro ac:name="info">
                <ac:parameter ac:name="title">Important</ac:parameter>
                <ac:rich-text-body><p>Read in storage format before editing.</p></ac:rich-text-body>
            </ac:structured-macro>
            <ac:structured-macro ac:name="expand">
                <ac:parameter ac:name="title">Details</ac:parameter>
                <ac:rich-text-body>
                    <ac:structured-macro ac:name="code">
                        <ac:parameter ac:name="language">json</ac:parameter>
                        <ac:plain-text-body><![CDATA[{"ok":true}]]></ac:plain-text-body>
                    </ac:structured-macro>
                </ac:rich-text-body>
            </ac:structured-macro>
        `;

        const md = confluenceStorageToMarkdown(xhtml);
        expect(md).not.toContain("toc");
        expect(md).toContain("[API Docs](https://example.com/docs)");
        expect(md).toContain("PROJ-42");
        expect(md).not.toContain("System Jira");
        expect(md).toContain("[READY]");
        expect(md).toContain("[Arch Doc](confluence-page:ENG:Architecture)");
        expect(md).toContain(
            "[ENG: System Overview](<confluence-page:ENG:System Overview>)",
        );
        expect(md).toContain("@jdoe");
        expect(md).toContain("> **Info: Important**");
        expect(md).toContain("> Read in storage format before editing.");
        expect(md).toContain("**Details**");
        expect(md).toContain('```json\n{"ok":true}\n```');
    });

    it("handles malformed tags, invalid entities and large payloads in linear time", () => {
        const malformed = "<p>Unclosed <b>bold &amp; &#999999999; &#x41; <unknown attr='1'>text</p>";
        expect(confluenceStorageToMarkdown(malformed)).toBe("Unclosed **bold & &#999999999; A text**");

        const largeChunk = "<p>Item with <s>old</s> and <code>val</code></p>".repeat(2000);
        const startedAt = Date.now();
        const result = confluenceStorageToMarkdown(largeChunk);
        expect(Date.now() - startedAt).toBeLessThan(1000);
        expect(result).toContain("Item with ~~old~~ and `val`");
    });
});
