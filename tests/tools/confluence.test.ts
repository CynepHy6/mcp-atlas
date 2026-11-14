// Тесты для Confluence инструментов

import axios from "axios";
import nock from "nock";
import {
    createConfluencePageHandler,
    createConfluencePageSchema,
} from "../../src/tools/confluence/create-confluence-page.js";
import {
    editConfluencePageHandler,
    editConfluencePageSchema,
} from "../../src/tools/confluence/edit-confluence-page.js";
import {
    getConfluencePageHandler,
    getConfluencePageSchema,
} from "../../src/tools/confluence/get-confluence-page.js";
import {
    searchConfluencePagesHandler,
    searchConfluencePagesSchema,
} from "../../src/tools/confluence/search-confluence-pages.js";

describe("Confluence Tools", () => {
    const mockConfig = {
        host: "https://test-confluence.example.com",
        username: "test@example.com",
        password: "test-password",
        apiToken: "test-api-token",
    };

    let confluenceClient: any;

    beforeEach(() => {
        // Create confluence client directly with our mock config
        confluenceClient = axios.create({
            baseURL: `${mockConfig.host}/rest/api`,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer test-confluence-token`,
            },
            timeout: 10000,
        });

        // Clear all nock interceptors
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
    });

    describe("searchConfluencePagesHandler", () => {
        it("should search for pages successfully", async () => {
            const mockResponse = {
                results: [
                    {
                        content: {
                            id: "123456",
                            title: "Test Page Title",
                            _links: {
                                webui: "/display/SPACE/Test+Page+Title",
                            },
                        },
                        resultGlobalContainer: {
                            title: "Test Space",
                            displayUrl: "/display/SPACE",
                        },
                        friendlyLastModified: "2 days ago",
                        excerpt: "This is a test page excerpt...",
                        url: "/display/SPACE/Test+Page+Title",
                    },
                ],
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/search")
                .query({
                    cql: 'text ~ "test query" AND type = "page"',
                    limit: 10,
                    expand: "space,version",
                })
                .reply(200, mockResponse);

            const handler = searchConfluencePagesHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                query: "test query",
                type: "page" as const,
                limit: 10,
            });

            expect(result.content[0].text).toContain(
                "Found 1 page(s) for query",
            );
            expect(result.content[0].text).toContain("Test Page Title");
            expect(result.content[0].text).toContain("ID: 123456");
            expect(result.content[0].text).toContain("Test Space");
        });

        it("should search with space filter", async () => {
            const mockResponse = {
                results: [],
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/search")
                .query({
                    cql: 'text ~ "test" AND type = "page" AND space = "PROJ"',
                    limit: 10,
                    expand: "space,version",
                })
                .reply(200, mockResponse);

            const handler = searchConfluencePagesHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                query: "test",
                spaceKey: "PROJ",
                type: "page" as const,
                limit: 10,
            });

            expect(result.content[0].text).toContain(
                "No pages found for query",
            );
            expect(result.content[0].text).toContain("in space PROJ");
        });

        it("should clean up search highlighting markup", async () => {
            const mockResponse = {
                results: [
                    {
                        content: {
                            id: "123456",
                            title: "@@@hl@@@Test@@@endhl@@@ Page",
                            _links: {
                                webui: "/display/SPACE/Test+Page",
                            },
                        },
                        resultGlobalContainer: {
                            title: "Test Space",
                            displayUrl: "/display/SPACE",
                        },
                        friendlyLastModified: "1 day ago",
                        excerpt:
                            "This is a @@@hl@@@test@@@endhl@@@ excerpt with &lt;html&gt; entities...",
                        url: "/display/SPACE/Test+Page",
                    },
                ],
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/search")
                .query({
                    cql: 'text ~ "test" AND type = "page"',
                    limit: 10,
                    expand: "space,version",
                })
                .reply(200, mockResponse);

            const handler = searchConfluencePagesHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                query: "test",
                type: "page" as const,
                limit: 10,
            });

            // Should clean up highlighting markup
            expect(result.content[0].text).toContain("Test Page");
            expect(result.content[0].text).not.toContain("@@@hl@@@");
            expect(result.content[0].text).not.toContain("@@@endhl@@@");

            // Should decode HTML entities
            expect(result.content[0].text).toContain(
                "test excerpt with <html> entities",
            );
            expect(result.content[0].text).not.toContain("&lt;");
            expect(result.content[0].text).not.toContain("&gt;");
        });

        it("should handle API errors gracefully", async () => {
            nock("https://test-confluence.example.com")
                .get("/rest/api/search")
                .query({
                    cql: 'text ~ "test" AND type = "page"',
                    limit: 10,
                    expand: "space,version",
                })
                .replyWithError("Network error");

            const handler = searchConfluencePagesHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                query: "test",
                type: "page" as const,
                limit: 10,
            });

            expect(result.content[0].text).toContain("Search failed");
            expect(result.content[0].text).toContain("Network error");
        });

        it("should validate configuration", async () => {
            const invalidConfig = { ...mockConfig, host: "" };

            const handler = searchConfluencePagesHandler(
                confluenceClient,
                invalidConfig,
            );
            const result = await handler({
                query: "test",
                type: "page" as const,
                limit: 10,
            });

            expect(result.content[0].text).toContain("Configuration error");
        });
    });

    describe("createConfluencePageHandler", () => {
        it("should create a page successfully", async () => {
            const mockResponse = {
                id: "456789",
                title: "New Test Page",
                status: "current",
                space: {
                    name: "Engineering Space",
                },
                version: {
                    number: 1,
                },
                _links: {
                    webui: "/spaces/ENG/pages/456789/New+Test+Page",
                },
            };

            nock("https://test-confluence.example.com")
                .post("/rest/api/content", {
                    type: "page",
                    title: "New Test Page",
                    space: {
                        key: "ENG",
                    },
                    body: {
                        storage: {
                            value: "<p>Hello from test</p>",
                            representation: "storage",
                        },
                    },
                })
                .reply(200, mockResponse);

            const handler = createConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                spaceKey: "ENG",
                title: "New Test Page",
                content: "<p>Hello from test</p>",
            });

            expect(result.content[0].text).toContain(
                "Page created successfully",
            );
            expect(result.content[0].text).toContain("Title: New Test Page");
            expect(result.content[0].text).toContain("ID: 456789");
            expect(result.content[0].text).toContain(
                "Space: Engineering Space",
            );
            expect(result.content[0].text).toContain(
                "URL: https://test-confluence.example.com/spaces/ENG/pages/456789/New+Test+Page",
            );
        });

        it("should create a child page using parent page URL", async () => {
            const mockResponse = {
                id: "456790",
                title: "Child Test Page",
                status: "current",
                space: {
                    name: "Engineering Space",
                },
                version: {
                    number: 1,
                },
                _links: {
                    webui: "/pages/viewpage.action?pageId=456790",
                },
            };

            nock("https://test-confluence.example.com")
                .post("/rest/api/content", {
                    type: "page",
                    title: "Child Test Page",
                    space: {
                        key: "ENG",
                    },
                    body: {
                        storage: {
                            value: "<p>Nested page</p>",
                            representation: "storage",
                        },
                    },
                    ancestors: [{ id: "123456" }],
                })
                .reply(200, mockResponse);

            const handler = createConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                spaceKey: "ENG",
                title: "Child Test Page",
                content: "<p>Nested page</p>",
                parentPageIdOrUrl:
                    "https://confluence.example.com/wiki/spaces/ENG/pages/123456/Parent+Page",
            });

            expect(result.content[0].text).toContain("ID: 456790");
            expect(result.content[0].text).toContain("Parent page ID: 123456");
        });

        it("should reject invalid parent page URL", async () => {
            const handler = createConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                spaceKey: "ENG",
                title: "Broken Parent Page",
                content: "<p>Nested page</p>",
                parentPageIdOrUrl: "https://invalid.example.com/not-a-page",
            });

            expect(result.content[0].text).toContain(
                "Cannot extract parent page ID from URL",
            );
        });

        it("should handle create page API errors gracefully", async () => {
            nock("https://test-confluence.example.com")
                .post("/rest/api/content")
                .reply(400, {
                    message: "A page with this title already exists",
                });

            const handler = createConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                spaceKey: "ENG",
                title: "Duplicate Page",
                content: "<p>Duplicate</p>",
            });

            expect(result.content[0].text).toContain("Failed to create page");
            expect(result.content[0].text).toContain(
                "A page with this title already exists",
            );
        });

        it("should validate configuration before create", async () => {
            const invalidConfig = { ...mockConfig, username: "" };

            const handler = createConfluencePageHandler(
                confluenceClient,
                invalidConfig,
            );
            const result = await handler({
                spaceKey: "ENG",
                title: "Config Error Page",
                content: "<p>Test</p>",
            });

            expect(result.content[0].text).toContain("Configuration error");
        });
    });

    describe("editConfluencePageHandler", () => {
        it("should update page title and content successfully", async () => {
            const currentPage = {
                id: "555001",
                type: "page",
                title: "Old Title",
                status: "current",
                space: {
                    key: "ENG",
                    name: "Engineering Space",
                },
                version: {
                    number: 3,
                },
                body: {
                    storage: {
                        value: "<p>Old content</p>",
                    },
                },
            };

            const updatedPage = {
                id: "555001",
                title: "New Title",
                status: "current",
                space: {
                    key: "ENG",
                    name: "Engineering Space",
                },
                version: {
                    number: 4,
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/ENG/New+Title",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/555001")
                .query({
                    expand: "space,version,body.storage",
                })
                .reply(200, currentPage);

            nock("https://test-confluence.example.com")
                .put("/rest/api/content/555001", {
                    id: "555001",
                    type: "page",
                    title: "New Title",
                    space: {
                        key: "ENG",
                    },
                    body: {
                        storage: {
                            value: "<p>New content</p>",
                            representation: "storage",
                        },
                    },
                    version: {
                        number: 4,
                    },
                })
                .reply(200, updatedPage);

            const handler = editConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "555001",
                title: "New Title",
                content: "<p>New content</p>",
            });

            expect(result.content[0].text).toContain(
                "Page updated successfully",
            );
            expect(result.content[0].text).toContain("Title: New Title");
            expect(result.content[0].text).toContain("Version: 4");
            expect(result.content[0].text).toContain(
                "URL: https://test-confluence.example.com/display/ENG/New+Title",
            );
        });

        it("should update content by page URL and keep current title", async () => {
            const currentPage = {
                id: "555002",
                type: "page",
                title: "Stable Title",
                status: "current",
                space: {
                    key: "ENG",
                    name: "Engineering Space",
                },
                version: {
                    number: 1,
                },
                body: {
                    storage: {
                        value: "<p>Old body</p>",
                    },
                },
            };

            const updatedPage = {
                id: "555002",
                title: "Stable Title",
                status: "current",
                space: {
                    key: "ENG",
                    name: "Engineering Space",
                },
                version: {
                    number: 2,
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/pages/viewpage.action?pageId=555002",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/555002")
                .query({
                    expand: "space,version,body.storage",
                })
                .reply(200, currentPage);

            nock("https://test-confluence.example.com")
                .put("/rest/api/content/555002", {
                    id: "555002",
                    type: "page",
                    title: "Stable Title",
                    space: {
                        key: "ENG",
                    },
                    body: {
                        storage: {
                            value: "<p>Updated body</p>",
                            representation: "storage",
                        },
                    },
                    version: {
                        number: 2,
                    },
                })
                .reply(200, updatedPage);

            const handler = editConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl:
                    "https://confluence.example.com/display/SPACE/viewpage.action?pageId=555002",
                content: "<p>Updated body</p>",
            });

            expect(result.content[0].text).toContain("Title: Stable Title");
            expect(result.content[0].text).toContain("Version: 2");
        });

        it("should reject edit request without fields to update", async () => {
            const handler = editConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "555003",
            });

            expect(result.content[0].text).toContain("Nothing to update");
        });

        it("should reject invalid page URL", async () => {
            const handler = editConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "https://invalid.example.com/not-a-page",
                title: "New Title",
            });

            expect(result.content[0].text).toContain(
                "Cannot extract page ID from URL",
            );
        });

        it("should handle update API errors gracefully", async () => {
            const currentPage = {
                id: "555004",
                type: "page",
                title: "Original Title",
                status: "current",
                space: {
                    key: "ENG",
                    name: "Engineering Space",
                },
                version: {
                    number: 5,
                },
                body: {
                    storage: {
                        value: "<p>Body</p>",
                    },
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/555004")
                .query({
                    expand: "space,version,body.storage",
                })
                .reply(200, currentPage);

            nock("https://test-confluence.example.com")
                .put("/rest/api/content/555004")
                .reply(409, { message: "Version conflict" });

            const handler = editConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "555004",
                title: "Updated Title",
            });

            expect(result.content[0].text).toContain("Failed to update page");
            expect(result.content[0].text).toContain("Version conflict");
        });

        it("should validate configuration before update", async () => {
            const invalidConfig = { ...mockConfig, username: "" };

            const handler = editConfluencePageHandler(
                confluenceClient,
                invalidConfig,
            );
            const result = await handler({
                pageIdOrUrl: "555005",
                title: "Config Error Title",
            });

            expect(result.content[0].text).toContain("Configuration error");
        });
    });

    describe("getConfluencePageHandler", () => {
        it("should get page in compact format without comments by default", async () => {
            const mockPage = {
                id: "123456",
                title: "Test Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-02T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Test+Page",
                },
                body: {
                    storage: {
                        value: "<h2>Overview</h2><p>This is <strong>test</strong> content with <s>cancelled item</s></p><ac:structured-macro ac:name=\"code\"><ac:parameter ac:name=\"language\">ts</ac:parameter><ac:plain-text-body><![CDATA[const ready = true;]]></ac:plain-text-body></ac:structured-macro>",
                    },
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123456")
                .query({
                    expand: "space,history,version,body.storage",
                })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123456",
            });

            const text = result.content[0].text;
            expect(text).toContain("Title: Test Page");
            expect(text).toContain("Space: Test Space");
            expect(text).toContain("Type: page");
            expect(text).toContain("Status: current");
            expect(text).toContain("Created:");
            expect(text).toContain("## Overview");
            expect(text).toContain(
                "This is **test** content with ~~cancelled item~~",
            );
            expect(text).toContain("```ts\nconst ready = true;\n```");
            expect(text).not.toContain("<ac:structured-macro");
            expect(text).toContain(
                "URL: https://test-confluence.example.com/display/SPACE/Test+Page",
            );
            expect(text).not.toContain("Comments:");
        });

        it("should return raw Confluence Storage XHTML when bodyFormat is 'storage'", async () => {
            const rawStorage =
                '<p>Raw <s>storage</s></p><ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[x = 1]]></ac:plain-text-body></ac:structured-macro>';
            const mockPage = {
                id: "123460",
                title: "Editable Page",
                type: "page",
                status: "current",
                space: { name: "Test Space" },
                history: { createdDate: "2023-01-01T00:00:00.000Z" },
                version: { when: "2023-01-02T00:00:00.000Z" },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Editable+Page",
                },
                body: {
                    storage: {
                        value: rawStorage,
                    },
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123460")
                .query({
                    expand: "space,history,version,body.storage",
                })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123460",
                bodyFormat: "storage",
            });

            expect(result.content[0].text).toContain(`Content:\n${rawStorage}`);
            expect(result.content[0].text).not.toContain("Comments:");
        });

        it("should extract page ID from viewpage.action URL without fetching comments by default", async () => {
            const mockPage = {
                id: "789012",
                title: "Another Test Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-01T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Another+Test+Page",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/789012")
                .query({
                    expand: "space,history,version",
                })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl:
                    "https://confluence.example.com/display/SPACE/viewpage.action?pageId=789012",
                includeBody: false,
            });

            expect(result.content[0].text).toContain(
                "Title: Another Test Page",
            );
            expect(result.content[0].text).not.toContain("Comments:");
        });

        it("should extract page ID from pages URL format", async () => {
            const mockPage = {
                id: "345678",
                title: "Third Test Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-01T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Third+Test+Page",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/345678")
                .query({
                    expand: "space,history,version",
                })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl:
                    "https://confluence.example.com/wiki/spaces/SPACE/pages/345678/Third+Test+Page",
                includeBody: false,
            });

            expect(result.content[0].text).toContain("Title: Third Test Page");
            expect(result.content[0].text).not.toContain("Comments:");
        });

        it("should fall back to version date when history date is absent", async () => {
            const mockPage = {
                id: "345679",
                title: "Version Date Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                version: {
                    when: "2023-02-03T04:05:06.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Version+Date+Page",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/345679")
                .query({
                    expand: "space,history,version",
                })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "345679",
                includeBody: false,
            });

            expect(result.content[0].text).toContain("Created:");
            expect(result.content[0].text).not.toContain("Invalid Date");
            expect(result.content[0].text).not.toContain("Comments:");
        });

        it("should include page comments when includeComments is true", async () => {
            const mockPage = {
                id: "123457",
                title: "Commented Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-02T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Commented+Page",
                },
            };

            const commentsResponse = {
                results: [
                    {
                        id: "comment-1",
                        type: "comment",
                        status: "current",
                        body: {
                            storage: {
                                value: "<p>Inline comment <s>old</s> body</p>",
                            },
                        },
                        history: {
                            createdDate: "2023-02-03T04:05:06.000Z",
                            createdBy: {
                                displayName: "Jane Doe",
                            },
                        },
                        extensions: {
                            location: "inline",
                            resolution: {
                                status: "open",
                            },
                            inlineProperties: {
                                textSelection: "ready for test",
                            },
                        },
                        _links: {
                            base: "https://test-confluence.example.com",
                            webui: "/pages/viewpage.action?pageId=123457&focusedCommentId=comment-1#comment-comment-1",
                        },
                    },
                ],
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123457")
                .query({
                    expand: "space,history,version",
                })
                .reply(200, mockPage);

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123457/child/comment")
                .query({
                    expand: "body.storage,history,version,extensions.resolution,extensions.inlineProperties",
                    limit: 100,
                    start: 0,
                })
                .reply(200, commentsResponse);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123457",
                includeBody: false,
                includeComments: true,
            });

            expect(result.content[0].text).toContain("Comments (1):");
            expect(result.content[0].text).toContain("Jane Doe");
            expect(result.content[0].text).toContain("Location: inline");
            expect(result.content[0].text).toContain("Resolution: open");
            expect(result.content[0].text).toContain(
                "Selected text: ready for test",
            );
            expect(result.content[0].text).toContain(
                "Inline comment ~~old~~ body",
            );
        });

        it("should apply commentsLimit when includeComments is true and ignore commentsLimit when false", async () => {
            const mockPage = {
                id: "123461",
                title: "Many Comments Page",
                type: "page",
                status: "current",
                space: { name: "Test Space" },
                history: { createdDate: "2023-01-01T00:00:00.000Z" },
                version: { when: "2023-01-02T00:00:00.000Z" },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Many+Comments+Page",
                },
            };

            const commentsResponse = {
                results: [1, 2, 3, 4].map((i) => ({
                    id: `c-${i}`,
                    type: "comment",
                    status: "current",
                    body: { storage: { value: `<p>Comment #${i}</p>` } },
                    history: {
                        createdDate: "2023-02-03T04:05:06.000Z",
                        createdBy: { displayName: `Author ${i}` },
                    },
                })),
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123461")
                .query({ expand: "space,history,version" })
                .times(2)
                .reply(200, mockPage);

            const commentScope = nock("https://test-confluence.example.com")
                .get("/rest/api/content/123461/child/comment")
                .query({
                    expand: "body.storage,history,version,extensions.resolution,extensions.inlineProperties",
                    limit: 100,
                    start: 0,
                })
                .once()
                .reply(200, commentsResponse);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );

            // When includeComments is false, comments endpoint must NOT be called even with commentsLimit
            const withoutComments = await handler({
                pageIdOrUrl: "123461",
                includeBody: false,
                includeComments: false,
                commentsLimit: 2,
            });
            expect(withoutComments.content[0].text).not.toContain("Comments (");
            expect(withoutComments.content[0].text).not.toContain("Comments:");
            expect(withoutComments.content[0].text).toContain(
                "Note: commentsLimit=2 was ignored because includeComments=false.",
            );
            expect(commentScope.isDone()).toBe(false);

            // When includeComments is true, only last 2 comments are shown
            const withLimitedComments = await handler({
                pageIdOrUrl: "123461",
                includeBody: false,
                includeComments: true,
                commentsLimit: 2,
            });
            expect(commentScope.isDone()).toBe(true);
            const text = withLimitedComments.content[0].text;
            expect(text).toContain(
                "Comments (showing last 2 of 4 total, 2 earlier skipped):",
            );
            expect(text).not.toContain("Comment #1");
            expect(text).not.toContain("Comment #2");
            expect(text).toContain("Comment #3");
            expect(text).toContain("Comment #4");
        });

        it("should keep custom expandProperties while including comments", async () => {
            const mockPage = {
                id: "123458",
                title: "Expanded Comments Page",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-02T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Expanded+Comments+Page",
                },
            };

            const commentsResponse = {
                results: [
                    {
                        id: "comment-2",
                        type: "comment",
                        status: "current",
                        body: {
                            storage: {
                                value: "<p>Footer comment body</p>",
                            },
                        },
                        history: {
                            createdDate: "2023-02-03T04:05:06.000Z",
                            createdBy: {
                                displayName: "John Doe",
                            },
                        },
                        extensions: {
                            location: "footer",
                        },
                    },
                ],
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123458")
                .query({
                    expand: "space,history,version,children.comment",
                })
                .reply(200, mockPage);

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123458/child/comment")
                .query({
                    expand: "body.storage,history,version,extensions.resolution,extensions.inlineProperties",
                    limit: 100,
                    start: 0,
                })
                .reply(200, commentsResponse);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123458",
                includeBody: false,
                includeComments: true,
                expandProperties: ["children.comment"],
            });

            expect(result.content[0].text).toContain("Comments (1):");
            expect(result.content[0].text).toContain("John Doe");
            expect(result.content[0].text).toContain("Location: footer");
            expect(result.content[0].text).toContain("Footer comment body");
        });

        it("should mention when page comments are absent when includeComments is true", async () => {
            const mockPage = {
                id: "123459",
                title: "Page Without Comments",
                type: "page",
                status: "current",
                space: {
                    name: "Test Space",
                },
                history: {
                    createdDate: "2023-01-01T00:00:00.000Z",
                },
                version: {
                    when: "2023-01-02T00:00:00.000Z",
                },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Page+Without+Comments",
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123459")
                .query({
                    expand: "space,history,version",
                })
                .reply(200, mockPage);

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123459/child/comment")
                .query({
                    expand: "body.storage,history,version,extensions.resolution,extensions.inlineProperties",
                    limit: 100,
                    start: 0,
                })
                .reply(200, {
                    results: [],
                });

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123459",
                includeBody: false,
                includeComments: true,
            });

            expect(result.content[0].text).toContain("Comments:");
            expect(result.content[0].text).toContain("No comments found.");
        });

        it("should reject empty pageIdOrUrl and non-positive commentsLimit without HTTP calls", async () => {
            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );

            const emptyRes = await handler({
                pageIdOrUrl: "   ",
            });
            expect(emptyRes.content[0].text).toContain(
                "Cannot extract page ID from URL",
            );

            const badLimitRes = await handler({
                pageIdOrUrl: "123456",
                includeComments: true,
                commentsLimit: 0,
            });
            expect(badLimitRes.content[0].text).toContain(
                "commentsLimit must be a positive integer",
            );
        });

        it("should preserve page content when secondary comments fetch fails", async () => {
            const mockPage = {
                id: "123462",
                title: "Page With Failing Comments",
                type: "page",
                status: "current",
                space: { name: "Test Space" },
                history: { createdDate: "2023-01-01T00:00:00.000Z" },
                version: { when: "2023-01-02T00:00:00.000Z" },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Failing+Comments",
                },
                body: {
                    storage: {
                        value: "<p>Page body survives comment error</p>",
                    },
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123462")
                .query({ expand: "space,history,version,body.storage" })
                .reply(200, mockPage);

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123462/child/comment")
                .query(true)
                .replyWithError("Comments service unavailable");

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123462",
                includeComments: true,
            });

            expect(result.content[0].text).toContain(
                "Page body survives comment error",
            );
            expect(result.content[0].text).toContain(
                "Failed to retrieve comments: Comments service unavailable",
            );
        });

        it("should handle empty storage body value cleanly", async () => {
            const mockPage = {
                id: "123463",
                title: "Empty Body Page",
                type: "page",
                status: "current",
                space: { name: "Test Space" },
                history: { createdDate: "2023-01-01T00:00:00.000Z" },
                version: { when: "2023-01-02T00:00:00.000Z" },
                _links: {
                    base: "https://test-confluence.example.com",
                    webui: "/display/SPACE/Empty+Body",
                },
                body: {
                    storage: {
                        value: "",
                    },
                },
            };

            nock("https://test-confluence.example.com")
                .get("/rest/api/content/123463")
                .query({ expand: "space,history,version,body.storage" })
                .reply(200, mockPage);

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123463",
            });

            expect(result.content[0].text).toContain("Title: Empty Body Page");
            expect(result.content[0].text).not.toContain("Content:");
        });

        it("should handle page not found", async () => {
            nock("https://test-confluence.example.com")
                .get("/rest/api/content/999999")
                .query({
                    expand: "space,history,version",
                })
                .reply(404, { message: "Page not found" });

            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "999999",
                includeBody: false,
            });

            expect(result.content[0].text).toContain(
                "Failed to retrieve page: HTTP 404: Page not found",
            );
        });

        it("should handle invalid URL format", async () => {
            const handler = getConfluencePageHandler(
                confluenceClient,
                mockConfig,
            );
            const result = await handler({
                pageIdOrUrl: "https://invalid-url-format.com/some/path",
                includeBody: false,
            });

            expect(result.content[0].text).toContain(
                "Cannot extract page ID from URL",
            );
        });

        it("should validate configuration", async () => {
            const invalidConfig = { ...mockConfig, username: "" };

            const handler = getConfluencePageHandler(
                confluenceClient,
                invalidConfig,
            );
            const result = await handler({
                pageIdOrUrl: "123456",
                includeBody: false,
            });

            expect(result.content[0].text).toContain("Configuration error");
        });
    });

    describe("Schema validation", () => {
        it("should validate createConfluencePageSchema", () => {
            expect(createConfluencePageSchema.spaceKey).toBeDefined();
            expect(createConfluencePageSchema.title).toBeDefined();
            expect(createConfluencePageSchema.content).toBeDefined();
            expect(createConfluencePageSchema.parentPageIdOrUrl).toBeDefined();
        });

        it("should validate editConfluencePageSchema", () => {
            expect(editConfluencePageSchema.pageIdOrUrl).toBeDefined();
            expect(editConfluencePageSchema.title).toBeDefined();
            expect(editConfluencePageSchema.content).toBeDefined();
        });

        it("should validate searchConfluencePagesSchema", () => {
            expect(searchConfluencePagesSchema.query).toBeDefined();
            expect(searchConfluencePagesSchema.spaceKey).toBeDefined();
            expect(searchConfluencePagesSchema.type).toBeDefined();
            expect(searchConfluencePagesSchema.limit).toBeDefined();
        });

        it("should validate getConfluencePageSchema", () => {
            expect(getConfluencePageSchema.pageIdOrUrl).toBeDefined();
            expect(getConfluencePageSchema.includeBody.parse(undefined)).toBe(
                true,
            );
            expect(getConfluencePageSchema.bodyFormat.parse(undefined)).toBe(
                "compact",
            );
            expect(
                getConfluencePageSchema.includeComments.parse(undefined),
            ).toBe(false);
            expect(
                getConfluencePageSchema.commentsLimit.parse(undefined),
            ).toBeUndefined();
            expect(getConfluencePageSchema.expandProperties).toBeDefined();
        });
    });
});
