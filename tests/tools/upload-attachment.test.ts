import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    UPLOAD_ATTACHMENT_MAX_BYTES,
    appendThumbnailMarkup,
    oversizedFileMessage,
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

    const createMockJira = (
        addAttachment = jest.fn(),
        description: string | null = "Existing text",
    ) => {
        const editIssue = jest.fn().mockResolvedValue(undefined);
        const getIssue = jest.fn().mockResolvedValue({
            fields: { description },
        });
        return {
            client: {
                issueAttachments: { addAttachment },
                issues: { getIssue, editIssue },
            } as any,
            getIssue,
            editIssue,
        };
    };

    it("uploads a local file and returns attachment metadata", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            {
                id: "10001",
                filename: "shot.png",
                mimeType: "image/png",
                size: 4,
            },
        ]);
        const { client, getIssue, editIssue } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        expect(getIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: ["description"],
        });
        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: {
                description: "Existing text\n\n!shot.png|thumbnail!",
            },
        });
        expect(result.content[0].text).toContain(
            "Preview appended to description: !shot.png|thumbnail!",
        );
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
        const { client, editIssue } = createMockJira(addAttachment, "");
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: { description: "!board.jpg|thumbnail!" },
        });
        expect(result.content[0].text).toContain("!board.jpg|thumbnail!");
    });

    it("rejects a missing file without calling Jira", async () => {
        const addAttachment = jest.fn();
        const { client, editIssue } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

        const missing = path.join(tempDir, "missing.png");
        const result = await handler({
            issueKey: "PROJ-42",
            filePath: missing,
        });

        expect(addAttachment).not.toHaveBeenCalled();
        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(`File not found: ${missing}`);
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("rejects a directory without calling Jira", async () => {
        const addAttachment = jest.fn();
        const { client } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        const { client } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        const { client, editIssue } = createMockJira(addAttachment, "Keep");
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        expect(editIssue).toHaveBeenCalledWith({
            issueIdOrKey: "PROJ-42",
            fields: { description: "Keep\n\n!evil.png|thumbnail!" },
        });
    });

    it("does not duplicate a thumbnail that is already in the description", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            { id: "9", filename: "shot.png", mimeType: "image/png", size: 4 },
        ]);
        const { client, editIssue } = createMockJira(
            addAttachment,
            "See !shot.png|thumbnail!",
        );
        const handler = uploadAttachmentHandler(client, mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Preview already in description: !shot.png|thumbnail!",
        );
    });

    it("keeps the attachment result when the description update fails", async () => {
        const addAttachment = jest.fn().mockResolvedValue([
            { id: "10", filename: "shot.png", mimeType: "image/png", size: 4 },
        ]);
        const { client, editIssue } = createMockJira(addAttachment, "Body");
        editIssue.mockRejectedValue({
            status: 400,
            response: {
                errorMessages: ["Description is required"],
                errors: {},
            },
        });
        const handler = uploadAttachmentHandler(client, mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(result.content[0].text).toContain("Attachment uploaded");
        expect(result.content[0].text).toContain(
            "thumbnail preview was not inserted",
        );
        expect(result.content[0].text).toContain("Description is required");
        expect(result.content[0].text).toContain("!shot.png|thumbnail!");
        expect(result.content[0].text).not.toContain("Preview appended");
    });

    it("rejects an invalid issue key", async () => {
        const addAttachment = jest.fn();
        const { client } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

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
        const { client, editIssue } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(editIssue).not.toHaveBeenCalled();
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
        const { client, editIssue } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, mockConfig);

        const result = await handler({
            issueKey: "PROJ-42",
            filePath,
        });

        expect(editIssue).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain(
            "Failed to upload attachment to PROJ-42",
        );
        expect(result.content[0].text).toContain("Attachments are disabled");
        expect(result.content[0].text).not.toContain("Attachment uploaded");
    });

    it("validates configuration before calling Jira", async () => {
        const addAttachment = jest.fn();
        const { client } = createMockJira(addAttachment);
        const handler = uploadAttachmentHandler(client, {
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

describe("appendThumbnailMarkup", () => {
    it("appends a thumbnail and leaves the existing description", () => {
        expect(appendThumbnailMarkup("Hello", "p1-search-1440-page.png")).toEqual({
            description: "Hello\n\n!p1-search-1440-page.png|thumbnail!",
            alreadyPresent: false,
        });
    });

    it("does not append the same thumbnail twice", () => {
        const description = "!shot.png|thumbnail!";
        expect(appendThumbnailMarkup(description, "shot.png")).toEqual({
            description,
            alreadyPresent: true,
        });
    });

    it("refuses a filename that would break wiki markup", () => {
        const result = appendThumbnailMarkup("Hello", "a|b.png");
        expect(result).toEqual({
            error: expect.stringContaining("cannot be embedded"),
        });
    });
});
