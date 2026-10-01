import axios from "axios";
// Create Confluence client instance
export const createConfluenceClient = (config) => {
    let host = config.host;
    if (host.includes("://")) {
        const url = new URL(host);
        host = url.href.replace(/\/$/, ""); // Remove trailing slash
    }
    else {
        host = `https://${host}`;
    }
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (config.apiToken) {
        // Для Confluence Server/Data Center используем Bearer токен
        headers.Authorization = `Bearer ${config.apiToken}`;
    }
    else if (config.password) {
        // Для обычной аутентификации используем Basic Auth
        const authString = Buffer.from(`${config.username}:${config.password}`).toString("base64");
        headers.Authorization = `Basic ${authString}`;
    }
    else {
        throw new Error("No authentication method configured for Confluence. Please set CONFLUENCE_PASSWORD or CONFLUENCE_API_TOKEN");
    }
    return axios.create({
        baseURL: `${host}/rest/api`,
        headers: headers,
        timeout: 10000,
    });
};
// Initialize Confluence client with environment variables
export const getConfluenceConfig = () => ({
    host: process.env.CONFLUENCE_HOST || "jira.corp.adobe.com",
    username: process.env.CONFLUENCE_USERNAME || process.env.JIRA_USERNAME || "",
    password: process.env.CONFLUENCE_PASSWORD || process.env.JIRA_PASSWORD || "",
    apiToken: process.env.CONFLUENCE_API_TOKEN,
});
// Create and return configured Confluence client instance
export const createConfiguredConfluenceClient = () => {
    const config = getConfluenceConfig();
    return createConfluenceClient(config);
};
