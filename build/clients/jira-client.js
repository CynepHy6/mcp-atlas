import { Version2Client } from "jira.js/version2";
// Create Jira client instance with modern jira.js library
export const createJiraClient = (config) => {
    // Parse host to handle full URLs
    let host = config.host;
    if (host.includes("://")) {
        const url = new URL(host);
        host = url.href; // jira.js expects full URL
    }
    else {
        host = `https://${host}`; // Default to HTTPS
    }
    // Configure authentication for jira.js
    let authentication;
    if (config.apiToken) {
        if (host.includes("skyeng.link")) {
            // Jira Server/Data Center with Personal Access Token using Bearer
            console.error(`Using Personal Access Token with Bearer for Jira Server: ${config.username}`);
            authentication = {
                oauth2: {
                    accessToken: config.apiToken,
                },
            };
        }
        else {
            // Atlassian Cloud with API Token using Basic Auth
            console.error(`Using API Token with Basic Auth for Atlassian Cloud: ${config.username}`);
            authentication = {
                basic: {
                    email: config.username,
                    apiToken: config.apiToken,
                },
            };
        }
    }
    else if (config.password) {
        // Basic authentication with username/password for any Jira
        console.error(`Using password authentication for: ${config.username}`);
        authentication = {
            basic: {
                email: config.username,
                apiToken: config.password,
            },
        };
    }
    else {
        throw new Error("No authentication method configured. Please set JIRA_PASSWORD or JIRA_API_TOKEN");
    }
    return new Version2Client({
        host: host,
        authentication: authentication,
    });
};
// Initialize Jira client with environment variables
export const getJiraConfig = () => ({
    host: process.env.JIRA_HOST || "jira.corp.adobe.com",
    username: process.env.JIRA_USERNAME || "",
    password: process.env.JIRA_PASSWORD || "",
    apiToken: process.env.JIRA_API_TOKEN,
});
// Create and return configured Jira client instance
export const createConfiguredJiraClient = () => {
    const config = getJiraConfig();
    return createJiraClient(config);
};
