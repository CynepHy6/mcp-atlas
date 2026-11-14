// Конвертация Confluence Storage XHTML в компактный читаемый Markdown без внешних зависимостей.
const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);
const BLOCK_ELEMENTS = new Set([
    "p",
    "div",
    "section",
    "article",
    "header",
    "footer",
    "blockquote",
    "pre",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "colgroup",
    "ac:task-list",
    "ac:task",
    "ac:layout",
    "ac:layout-section",
    "ac:layout-cell",
    "ac:rich-text-body",
    "ac:plain-text-body",
]);
const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "...",
    laquo: "«",
    raquo: "»",
    ldquo: '"',
    rdquo: '"',
    lsquo: "'",
    rsquo: "'",
    bull: "•",
    middot: "·",
    rarr: "→",
    larr: "←",
    harr: "↔",
    rArr: "⇒",
    times: "×",
    minus: "−",
    plusmn: "±",
    le: "≤",
    ge: "≥",
    ne: "≠",
    approx: "≈",
    copy: "©",
    reg: "®",
    trade: "™",
};
export function decodeHtmlEntities(input) {
    if (!input.includes("&")) {
        return input;
    }
    return input.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g, (full, dec, hex, named) => {
        if (dec !== undefined) {
            const code = Number.parseInt(dec, 10);
            if (Number.isSafeInteger(code) &&
                code > 0 &&
                code <= 0x10ffff) {
                return String.fromCodePoint(code);
            }
            return full;
        }
        if (hex !== undefined) {
            const code = Number.parseInt(hex, 16);
            if (Number.isSafeInteger(code) &&
                code > 0 &&
                code <= 0x10ffff) {
                return String.fromCodePoint(code);
            }
            return full;
        }
        if (named !== undefined && named in NAMED_ENTITIES) {
            return NAMED_ENTITIES[named];
        }
        return full;
    });
}
function findTagEnd(xml, startAfterLt) {
    let quote = null;
    for (let i = startAfterLt; i < xml.length; i++) {
        const ch = xml[i];
        if (quote) {
            if (ch === quote) {
                quote = null;
            }
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        else if (ch === ">") {
            return i;
        }
    }
    return -1;
}
function parseAttributes(rawAttrs) {
    const attrs = {};
    const attrRegex = /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = attrRegex.exec(rawAttrs)) !== null) {
        const key = match[1].toLowerCase();
        const rawVal = match[2] ?? match[3] ?? match[4] ?? "";
        attrs[key] = decodeHtmlEntities(rawVal);
    }
    return attrs;
}
function tokenize(xml) {
    const tokens = [];
    let pos = 0;
    while (pos < xml.length) {
        if (xml.startsWith("<![CDATA[", pos)) {
            const closeIdx = xml.indexOf("]]>", pos + 9);
            if (closeIdx === -1) {
                tokens.push({
                    type: "text",
                    value: xml.slice(pos + 9),
                    isCdata: true,
                });
                break;
            }
            tokens.push({
                type: "text",
                value: xml.slice(pos + 9, closeIdx),
                isCdata: true,
            });
            pos = closeIdx + 3;
            continue;
        }
        if (xml.startsWith("<!--", pos)) {
            const closeIdx = xml.indexOf("-->", pos + 4);
            pos = closeIdx === -1 ? xml.length : closeIdx + 3;
            continue;
        }
        if (xml.startsWith("<?", pos) || xml.startsWith("<!", pos)) {
            const closeIdx = xml.indexOf(">", pos + 2);
            pos = closeIdx === -1 ? xml.length : closeIdx + 1;
            continue;
        }
        if (xml[pos] === "<") {
            const nextChar = xml[pos + 1] ?? "";
            const isClosing = nextChar === "/";
            const nameStart = isClosing ? pos + 2 : pos + 1;
            const firstNameChar = xml[nameStart] ?? "";
            if (/[A-Za-z_:]/.test(firstNameChar)) {
                const tagEnd = findTagEnd(xml, nameStart);
                if (tagEnd !== -1) {
                    const inside = xml.slice(nameStart, tagEnd).trim();
                    if (isClosing) {
                        const name = inside.split(/\s+/)[0].toLowerCase();
                        tokens.push({ type: "close", name });
                    }
                    else {
                        const selfClosingSlash = inside.endsWith("/");
                        const cleanInside = selfClosingSlash
                            ? inside.slice(0, -1).trim()
                            : inside;
                        const spaceIdx = cleanInside.search(/\s/);
                        const name = (spaceIdx === -1
                            ? cleanInside
                            : cleanInside.slice(0, spaceIdx)).toLowerCase();
                        const rawAttrs = spaceIdx === -1
                            ? ""
                            : cleanInside.slice(spaceIdx + 1);
                        const attrs = rawAttrs ? parseAttributes(rawAttrs) : {};
                        tokens.push({
                            type: "open",
                            name,
                            attrs,
                            selfClosing: selfClosingSlash || VOID_ELEMENTS.has(name),
                        });
                    }
                    pos = tagEnd + 1;
                    continue;
                }
            }
            tokens.push({ type: "text", value: "<", isCdata: false });
            pos += 1;
            continue;
        }
        const nextLt = xml.indexOf("<", pos);
        const sliceEnd = nextLt === -1 ? xml.length : nextLt;
        tokens.push({
            type: "text",
            value: decodeHtmlEntities(xml.slice(pos, sliceEnd)),
            isCdata: false,
        });
        pos = sliceEnd;
    }
    return tokens;
}
function parseAst(tokens) {
    const root = {
        type: "element",
        name: "#root",
        attrs: {},
        children: [],
    };
    const stack = [root];
    for (const token of tokens) {
        if (token.type === "text") {
            stack[stack.length - 1].children.push(token);
        }
        else if (token.type === "open") {
            const node = {
                type: "element",
                name: token.name,
                attrs: token.attrs,
                children: [],
            };
            stack[stack.length - 1].children.push(node);
            if (!token.selfClosing) {
                stack.push(node);
            }
        }
        else if (token.type === "close") {
            for (let i = stack.length - 1; i >= 1; i--) {
                if (stack[i].name === token.name) {
                    stack.length = i;
                    break;
                }
            }
        }
    }
    return root.children;
}
function rawTextContent(node) {
    if (node.type === "text") {
        return node.value;
    }
    return node.children.map(rawTextContent).join("");
}
function findChildElements(node, name) {
    return node.children.filter((child) => child.type === "element" && child.name === name);
}
function findFirstDescendant(node, name) {
    for (const child of node.children) {
        if (child.type === "element") {
            if (child.name === name) {
                return child;
            }
            const nested = findFirstDescendant(child, name);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
function wrapInlineLine(marker, text) {
    if (!text.trim()) {
        return text;
    }
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!match) {
        return `${marker}${text}${marker}`;
    }
    return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}
function wrapInline(marker, text) {
    if (!text.trim()) {
        return text;
    }
    return text
        .split("\n")
        .map((line) => (line.trim() ? wrapInlineLine(marker, line) : line))
        .join("\n");
}
function hasLineThroughStyle(style) {
    if (!style) {
        return false;
    }
    return /\btext-decoration(?:-line)?\s*:[^;]*\bline-through\b/i.test(style);
}
function isBlockMacro(node) {
    const macroName = (node.attrs["ac:name"] || "").toLowerCase();
    if (macroName === "jira" || macroName === "status") {
        return false;
    }
    if (macroName === "code" ||
        macroName === "noformat" ||
        macroName === "info" ||
        macroName === "note" ||
        macroName === "warning" ||
        macroName === "tip" ||
        macroName === "panel" ||
        macroName === "expand" ||
        macroName === "toc" ||
        macroName === "anchor") {
        return true;
    }
    return Boolean(findChildElements(node, "ac:rich-text-body").length > 0 ||
        findChildElements(node, "ac:plain-text-body").length > 0);
}
function isBlockNode(node) {
    if (node.type !== "element") {
        return false;
    }
    if (node.name === "ac:structured-macro") {
        return isBlockMacro(node);
    }
    return BLOCK_ELEMENTS.has(node.name);
}
function formatMarkdownLink(label, rawTarget) {
    const cleanTarget = rawTarget.replace(/[\r\n]+/g, " ").trim();
    if (!cleanTarget) {
        return label;
    }
    const safeLabel = label || cleanTarget;
    if (/[\s<>()]/.test(cleanTarget)) {
        const escapedTarget = cleanTarget
            .replace(/</g, "%3C")
            .replace(/>/g, "%3E");
        return `[${safeLabel}](<${escapedTarget}>)`;
    }
    return `[${safeLabel}](${cleanTarget})`;
}
function renderConfluenceLink(node, ctx) {
    const plainBody = findFirstDescendant(node, "ac:plain-text-link-body");
    const richBody = findFirstDescendant(node, "ac:link-body");
    const label = (plainBody
        ? rawTextContent(plainBody)
        : richBody
            ? renderInlineChildren(richBody.children, ctx)
            : "").trim();
    const riUser = findFirstDescendant(node, "ri:user");
    if (riUser) {
        const userId = riUser.attrs["ri:username"] ||
            riUser.attrs["ri:userkey"] ||
            riUser.attrs["ri:account-id"] ||
            "user";
        if (label) {
            return label.startsWith("@") ? label : `@${label}`;
        }
        return `@${userId}`;
    }
    const riPage = findFirstDescendant(node, "ri:page") ||
        findFirstDescendant(node, "ri:blog-post");
    if (riPage) {
        const title = riPage.attrs["ri:content-title"] || "";
        const space = riPage.attrs["ri:space-key"] || "";
        const displayTarget = space && title ? `${space}: ${title}` : title || space || "";
        const uriRef = space && title ? `${space}:${title}` : title || space || "";
        if (uriRef) {
            return formatMarkdownLink(label || displayTarget, `confluence-page:${uriRef}`);
        }
        return label;
    }
    const riAttachment = findFirstDescendant(node, "ri:attachment");
    if (riAttachment) {
        const filename = riAttachment.attrs["ri:filename"] || "";
        if (filename) {
            return formatMarkdownLink(label || filename, `attachment:${filename}`);
        }
        return label;
    }
    const riUrl = findFirstDescendant(node, "ri:url");
    if (riUrl) {
        const url = riUrl.attrs["ri:value"] || "";
        if (label && url && label !== url) {
            return formatMarkdownLink(label, url);
        }
        return url || label;
    }
    return label;
}
function renderConfluenceImage(node) {
    const alt = node.attrs["ac:alt"] || node.attrs["alt"] || "";
    const riAtt = findFirstDescendant(node, "ri:attachment");
    if (riAtt) {
        const filename = riAtt.attrs["ri:filename"] || "";
        if (filename) {
            return `![${alt || filename}](attachment:${filename})`;
        }
    }
    const riUrl = findFirstDescendant(node, "ri:url");
    if (riUrl) {
        const url = riUrl.attrs["ri:value"] || "";
        if (url) {
            return `![${alt}](${url})`;
        }
    }
    return alt ? `[Image: ${alt}]` : "";
}
function renderStructuredMacro(node, ctx) {
    const macroName = (node.attrs["ac:name"] || "").toLowerCase();
    if (macroName === "toc" || macroName === "anchor") {
        return "";
    }
    const params = {};
    for (const paramNode of findChildElements(node, "ac:parameter")) {
        const paramName = (paramNode.attrs["ac:name"] || "").toLowerCase();
        if (paramName) {
            params[paramName] = rawTextContent(paramNode).trim();
        }
    }
    if (macroName === "status") {
        return params.title ? `[${params.title}]` : "";
    }
    if (macroName === "jira") {
        if (params.key) {
            return params.key;
        }
        const jql = params.jqlquery || params.jql;
        return jql ? `[Jira JQL: ${jql}]` : "";
    }
    const plainBodyNode = findChildElements(node, "ac:plain-text-body")[0];
    const richBodyNode = findChildElements(node, "ac:rich-text-body")[0];
    if (macroName === "code" || macroName === "noformat") {
        const language = macroName === "code" ? (params.language || "").trim() : "";
        const rawCode = (plainBodyNode
            ? rawTextContent(plainBodyNode)
            : richBodyNode
                ? rawTextContent(richBodyNode)
                : "")
            .replace(/\r\n/g, "\n")
            .replace(/^\n+|\n+$/g, "");
        const fence = rawCode.includes("```") ? "~~~~" : "```";
        const titlePrefix = params.title ? `**${params.title}**\n` : "";
        return `${titlePrefix}${fence}${language}\n${rawCode}\n${fence}`;
    }
    const calloutLabels = {
        info: "Info",
        note: "Note",
        warning: "Warning",
        tip: "Tip",
        panel: "Panel",
    };
    if (macroName in calloutLabels) {
        const header = macroName === "panel"
            ? params.title
                ? `**${params.title}**`
                : ""
            : `**${calloutLabels[macroName]}${params.title ? `: ${params.title}` : ""}**`;
        const bodyMd = richBodyNode
            ? renderBlocks(richBodyNode.children, ctx).trim()
            : plainBodyNode
                ? rawTextContent(plainBodyNode).trim()
                : "";
        const combined = [header, bodyMd].filter(Boolean).join("\n");
        if (!combined) {
            return "";
        }
        return combined
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n");
    }
    if (macroName === "expand") {
        const bodyMd = richBodyNode
            ? renderBlocks(richBodyNode.children, ctx).trim()
            : plainBodyNode
                ? rawTextContent(plainBodyNode).trim()
                : "";
        const header = params.title ? `**${params.title}**` : "";
        return [header, bodyMd].filter(Boolean).join("\n\n");
    }
    if (richBodyNode) {
        return renderBlocks(richBodyNode.children, ctx).trim();
    }
    if (plainBodyNode) {
        const rawText = rawTextContent(plainBodyNode)
            .replace(/\r\n/g, "\n")
            .replace(/^\n+|\n+$/g, "");
        return rawText ? `\`\`\`\n${rawText}\n\`\`\`` : "";
    }
    const fallbackValue = params.url || params.uri || params.title || params.key;
    if (fallbackValue) {
        return `[${macroName || "macro"}: ${fallbackValue}]`;
    }
    return "";
}
function renderInlineNode(node, ctx) {
    if (node.type === "text") {
        if (node.isCdata) {
            return node.value;
        }
        return node.value.replace(/[\r\n\t]+/g, " ");
    }
    const { name, attrs, children } = node;
    if (name === "br") {
        return ctx.inTableCell ? " " : "\n";
    }
    if (name === "strong" || name === "b") {
        return wrapInline("**", renderInlineChildren(children, ctx));
    }
    if (name === "em" || name === "i") {
        return wrapInline("*", renderInlineChildren(children, ctx));
    }
    if (name === "s" ||
        name === "del" ||
        name === "strike" ||
        (name === "span" && hasLineThroughStyle(attrs.style))) {
        return wrapInline("~~", renderInlineChildren(children, ctx));
    }
    if (name === "code" || name === "tt") {
        const inner = renderInlineChildren(children, ctx);
        if (!inner) {
            return "";
        }
        return inner.includes("`") ? `\`\` ${inner} \`\`` : `\`${inner}\``;
    }
    if (name === "a") {
        const href = (attrs.href || "").trim();
        const label = renderInlineChildren(children, ctx).trim();
        if (!href) {
            return label;
        }
        if (!label || label === href) {
            return href;
        }
        return `[${label}](${href})`;
    }
    if (name === "img") {
        const src = (attrs.src || "").trim();
        const alt = (attrs.alt || "").trim();
        return src ? `![${alt}](${src})` : alt;
    }
    if (name === "time") {
        const inner = renderInlineChildren(children, ctx).trim();
        return inner || attrs.datetime || "";
    }
    if (name === "ac:link") {
        return renderConfluenceLink(node, ctx);
    }
    if (name === "ac:image") {
        return renderConfluenceImage(node);
    }
    if (name === "ac:emoticon") {
        return attrs["ac:emoji-fallback"] || attrs["ac:name"] || "";
    }
    if (name === "ac:structured-macro") {
        return renderStructuredMacro(node, ctx);
    }
    if (name === "colgroup" || name === "col") {
        return "";
    }
    return renderInlineChildren(children, ctx);
}
function renderInlineChildren(nodes, ctx) {
    return nodes.map((node) => renderInlineNode(node, ctx)).join("");
}
function renderListItem(liNode, prefix, ctx) {
    const indent = "  ".repeat(ctx.listDepth);
    const inlineBuffer = [];
    const subBlocks = [];
    const flushInline = () => {
        if (inlineBuffer.length === 0) {
            return "";
        }
        const text = renderInlineChildren(inlineBuffer, ctx).trim();
        inlineBuffer.length = 0;
        return text;
    };
    const parts = [];
    for (const child of liNode.children) {
        if (child.type === "element" &&
            (child.name === "ul" ||
                child.name === "ol" ||
                child.name === "ac:task-list")) {
            const inlineText = flushInline();
            if (inlineText) {
                parts.push(inlineText);
            }
            const nestedList = renderBlockElement(child, {
                ...ctx,
                listDepth: ctx.listDepth + 1,
            });
            if (nestedList) {
                subBlocks.push(nestedList);
            }
        }
        else if (child.type === "element" && child.name === "p") {
            const inlineText = flushInline();
            if (inlineText) {
                parts.push(inlineText);
            }
            const pText = renderInlineChildren(child.children, ctx).trim();
            if (pText) {
                parts.push(pText);
            }
        }
        else if (isBlockNode(child) && child.type === "element") {
            const inlineText = flushInline();
            if (inlineText) {
                parts.push(inlineText);
            }
            const renderedBlock = renderBlockElement(child, {
                ...ctx,
                listDepth: ctx.listDepth + 1,
            });
            if (renderedBlock) {
                subBlocks.push(renderedBlock);
            }
        }
        else {
            inlineBuffer.push(child);
        }
    }
    const tailText = flushInline();
    if (tailText) {
        parts.push(tailText);
    }
    const headLine = `${indent}${prefix}${parts.join(" ").trim()}`;
    return [headLine, ...subBlocks].filter(Boolean).join("\n");
}
function renderTaskList(node, ctx) {
    const indent = "  ".repeat(ctx.listDepth);
    const items = [];
    for (const taskNode of findChildElements(node, "ac:task")) {
        const statusNode = findFirstDescendant(taskNode, "ac:task-status");
        const bodyNode = findFirstDescendant(taskNode, "ac:task-body");
        const isComplete = (statusNode ? rawTextContent(statusNode).trim().toLowerCase() : "") ===
            "complete";
        const checkbox = isComplete ? "- [x] " : "- [ ] ";
        const bodyText = bodyNode
            ? renderBlocks(bodyNode.children, ctx)
                .replace(/\r?\n+/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            : "";
        items.push(`${indent}${checkbox}${bodyText}`);
    }
    return items.join("\n");
}
function collectTableRows(node) {
    const rows = [];
    for (const child of node.children) {
        if (child.type !== "element") {
            continue;
        }
        if (child.name === "tr") {
            rows.push(child);
        }
        else if (child.name === "thead" ||
            child.name === "tbody" ||
            child.name === "tfoot") {
            rows.push(...collectTableRows(child));
        }
    }
    return rows;
}
function renderTableCellContent(cellNode, ctx) {
    const cellCtx = { ...ctx, inTableCell: true };
    const blockText = renderBlocks(cellNode.children, cellCtx)
        .replace(/\r?\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return blockText.replace(/\|/g, "\\|");
}
function renderTable(tableNode, ctx) {
    const trNodes = collectTableRows(tableNode);
    if (trNodes.length === 0) {
        return "";
    }
    const matrix = [];
    let maxCols = 0;
    for (const tr of trNodes) {
        const cells = tr.children.filter((child) => child.type === "element" &&
            (child.name === "th" || child.name === "td"));
        if (cells.length === 0) {
            continue;
        }
        const rowValues = cells.map((cell) => renderTableCellContent(cell, ctx));
        maxCols = Math.max(maxCols, rowValues.length);
        matrix.push(rowValues);
    }
    if (matrix.length === 0 || maxCols === 0) {
        return "";
    }
    const normalizeRow = (row) => {
        const padded = Array.from({ length: maxCols }, (_, idx) => row[idx] ?? "");
        return `| ${padded.join(" | ")} |`;
    };
    const headerLine = normalizeRow(matrix[0]);
    const separatorLine = `| ${Array.from({ length: maxCols }, () => "---").join(" | ")} |`;
    const bodyLines = matrix.slice(1).map(normalizeRow);
    return [headerLine, separatorLine, ...bodyLines].join("\n");
}
function renderBlockElement(node, ctx) {
    const { name, attrs, children } = node;
    if (name === "colgroup" || name === "col") {
        return "";
    }
    if (/^h[1-6]$/.test(name)) {
        const level = Number.parseInt(name[1], 10);
        const headingText = renderInlineChildren(children, ctx)
            .replace(/\s+/g, " ")
            .trim();
        return headingText ? `${"#".repeat(level)} ${headingText}` : "";
    }
    if (name === "p") {
        return renderInlineChildren(children, ctx).trim();
    }
    if (name === "hr") {
        return "---";
    }
    if (name === "pre") {
        const raw = rawTextContent(node)
            .replace(/\r\n/g, "\n")
            .replace(/^\n+|\n+$/g, "");
        const fence = raw.includes("```") ? "~~~~" : "```";
        return `${fence}\n${raw}\n${fence}`;
    }
    if (name === "blockquote") {
        const inner = renderBlocks(children, ctx).trim();
        if (!inner) {
            return "";
        }
        return inner
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n");
    }
    if (name === "ul") {
        const items = findChildElements(node, "li").map((li) => renderListItem(li, "- ", ctx));
        return items.filter(Boolean).join("\n");
    }
    if (name === "ol") {
        const parsedStart = Number.parseInt(attrs.start || "1", 10);
        const startNum = Number.isFinite(parsedStart) ? parsedStart : 1;
        const items = findChildElements(node, "li").map((li, idx) => renderListItem(li, `${startNum + idx}. `, ctx));
        return items.filter(Boolean).join("\n");
    }
    if (name === "ac:task-list") {
        return renderTaskList(node, ctx);
    }
    if (name === "table") {
        if (ctx.inTableCell) {
            return renderBlocks(children, ctx);
        }
        return renderTable(node, ctx);
    }
    if (name === "ac:structured-macro") {
        return renderStructuredMacro(node, ctx);
    }
    return renderBlocks(children, ctx);
}
function renderBlocks(nodes, ctx) {
    const blocks = [];
    const inlineGroup = [];
    const flushInlineGroup = () => {
        if (inlineGroup.length === 0) {
            return;
        }
        const rendered = renderInlineChildren(inlineGroup, ctx).trim();
        inlineGroup.length = 0;
        if (rendered) {
            blocks.push(rendered);
        }
    };
    for (const node of nodes) {
        if (isBlockNode(node) && node.type === "element") {
            flushInlineGroup();
            const renderedBlock = renderBlockElement(node, ctx).trim();
            if (renderedBlock) {
                blocks.push(renderedBlock);
            }
        }
        else {
            inlineGroup.push(node);
        }
    }
    flushInlineGroup();
    return blocks.join("\n\n");
}
/**
 * Converts Confluence Storage Format XHTML into compact readable Markdown.
 * Preserves headings, lists, task lists, tables, links, code macros, callouts,
 * and strikethrough (`<s>`, `<del>`, `<strike>`, `line-through` -> `~~...~~`).
 */
export function confluenceStorageToMarkdown(storageXhtml) {
    if (!storageXhtml || !storageXhtml.trim()) {
        return "";
    }
    const tokens = tokenize(storageXhtml);
    const ast = parseAst(tokens);
    return renderBlocks(ast, { listDepth: 0, inTableCell: false }).trim();
}
