import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    UPLOAD_ATTACHMENT_MAX_BYTES,
    oversizedFileMessage,
    thumbnailWiki,
    uploadAttachmentHandler,
} from "../../src/tools/jira/upload-attachment.js";

describe("uploadAttachmentHandler", () => {
    const mockConfig = {
        host: "https://jira.example.com",
        username: "test@example.com",
        password: "",
        apiToken: "test-api-token",
    };

    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "mcp-atlas-upload-"),
    );
    const filePath = path.join(tempDir, "shot.png");

    beforeAll(() => {
        fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const createMockJira = (addAttachment = jest.fn()) =>
        ({
            issueAttachments: { addAttachment },
        }) as any;

    it("uploads a local file and returns attachment metadata", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            {
                id: "10001",
                filename: "shot.png",
                mimeType: "image/png",
                size: 4,
            },
        ]);
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "proj-42",
            filePath,
        });

        expect(addAttachment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            attachment: {
                filename: "shot.png",
                file: fs.readFileSync(filePath),
            },
        });
        expect(result.content[0].text).toContain("Attachment uploaded");
        expect(result.content[0].text).toContain("Issue: PROJ-42");
        expect(result.content[0].text).toContain("id: 10001");
        expect(result.content[0].text).toContain("filename: shot.png");
        expect(result.content[0].text).toContain("mimeType: image/png");
        expect(result.content[0].text).toContain(
            "URL: https://jira.example.com/browse/PROJ-42",
        );
        expect(result.content[0].text).toContain(
            "Wiki thumbnail: !shot.png|thumbnail!",
        );
        expect(result.content[0].text).not.toContain("description");
    });

    it("accepts a browse URL and an explicit filename", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            {
                id: "7",
                filename: "board.jpg",
                mimeType: "image/jpeg",
                size: 4,
            },
        ]);
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "https://jira.example.com/browse/PROJ-42",
            filePath,
            filename: "board.jpg",
        });

        expect(addAttachment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            attachment: {
                filename: "board.jpg",
                file: fs.readFileSync(filePath),
            },
        });
        expect(result.content[0].text).toContain(
            "Wiki thumbnail: !board.jpg|thumbnail!",
        );
    });

    it("rejects a missing file without calling Jira", async () => {
        const addAttachment = jest.fn();
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const missing = path.join(tempDir, "missing.png");
        const result = await handler({
            issueKey: "PROJ-42",
            filePath: missing,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(`File not found: ${missing}`);
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("rejects a directory without calling Jira", async () => {
        const addAttachment = jest.fn();
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            filePath: tempDir,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(`Not a file: ${tempDir}`);
    });

    it("rejects a file above the local size limit without calling Jira", async () => {
        const tooBig = oversizedFileMessage(
            UPLOAD_ATTACHMENT_MAX_BYTES + 1,
            "/tmp/big.png",
        );
        expect(tooBig).toContain("above the");
        expect(
            oversizedFileMessage(UPLOAD_ATTACHMENT_MAX_BYTES, "/tmp/ok.png"),
        ).toBeNull();

        const bigPath = path.join(tempDir, "big.bin");
        const fd = fs.openSync(bigPath, "w");
        fs.ftruncateSync(fd, UPLOAD_ATTACHMENT_MAX_BYTES + 1);
        fs.closeSync(fd);

        const addAttachment = jest.fn();
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            filePath: bigPath,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("above the");
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("stores only the base name when filename contains a path", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            { id: "8", filename: "evil.png", mimeType: "image/png", size: 4 },
        ]);
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        await handler({
            issueKey: "PROJ-42",
            filePath,
            filename: "../evil.png",
        });

        expect(addAttachment).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            attachment: {
                filename: "evil.png",
                file: fs.readFileSync(filePath),
            },
        });
    });

    it("rejects an invalid issue key", async () => {
        const addAttachment = jest.fn();
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "https://example.com/not-a-ticket",
            filePath,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Cannot extract issue key from issueKey",
        );
    });

    it("does not report success when Jira returns no attachment", async () => {
        const addAttachment = jest.fn().mockResolvedValue([]);
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(result.content[0].text).toContain("no attachment metadata");
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("surfaces Jira errors", async () => {
        const addAttachment = jest.fn().mockRejectedValue({
            status: 403,
            response: {
                errorMessages: ["Attachments are disabled"],
                errors: {},
            },
        });
        const handler = uploadAttachmentHandler(
            createMockJira(addAttachment),
            mockConfig,
        );

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(result.content[0].text).toContain(
            "Failed to upload attachment to PROJ-42",
        );
        expect(result.content[0].text).toContain("Attachments are disabled");
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("validates configuration before calling Jira", async () => {
        const addAttachment = jest.fn();
        const handler = uploadAttachmentHandler(createMockJira(addAttachment), {
            ...mockConfig,
            username: "",
        });

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Configuration error");
    });
});

describe("thumbnailWiki", () => {
    it("builds a thumbnail markup line", () => {
        expect(thumbnailWiki("p1-search-1440-page.png")).toBe(
            "!p1-search-1440-page.png|thumbnail!",
        );
    });

    it("refuses a filename that would break wiki markup", () => {
        expect(thumbnailWiki("a|b.png")).toBeNull();
        expect(thumbnailWiki("a!b.png")).toBeNull();
    });
});
