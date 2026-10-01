// Функции валидации конфигурации для Jira и Confluence
export function validateJiraConfig(config) {
    if (!config.host)
        return "JIRA_HOST environment variable is not set";
    if (!config.username)
        return "JIRA_USERNAME environment variable is not set (should be your email)";
    // Check if either password or API token is provided
    if (!config.password && !config.apiToken) {
        return "Either JIRA_PASSWORD or JIRA_API_TOKEN environment variable must be set";
    }
    // For Atlassian Cloud: validate email format for username when using API token
    if (config.apiToken && config.host.includes(".atlassian.net")) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(config.username)) {
            return "For Atlassian Cloud, JIRA_USERNAME must be a valid email address when using API token";
        }
    }
    return null;
}
export function validateConfluenceConfig(config) {
    if (!config.host)
        return "CONFLUENCE_HOST environment variable is not set";
    if (!config.username)
        return "CONFLUENCE_USERNAME environment variable is not set (should be your email)";
    if (!config.password && !config.apiToken) {
        return "Either CONFLUENCE_PASSWORD or CONFLUENCE_API_TOKEN environment variable must be set";
    }
    if (config.apiToken && config.host.includes(".atlassian.net")) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(config.username)) {
            return "For Atlassian Cloud, CONFLUENCE_USERNAME must be a valid email address when using API token";
        }
    }
    return null;
}
