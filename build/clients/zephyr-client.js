import axios from "axios";
import { getJiraConfig } from "./jira-client.js";
const resolveHost = (host) => {
    if (host.includes("://")) {
        return new URL(host).href.replace(/\/$/, "");
    }
    return `https://${host}`;
};
const buildAuthHeaders = (config) => {
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (config.apiToken) {
        headers.Authorization = `Bearer ${config.apiToken}`;
    }
    else if (config.password) {
        const authString = Buffer.from(`${config.username}:${config.password}`).toString("base64");
        headers.Authorization = `Basic ${authString}`;
    }
    else {
        throw new Error("No authentication method configured for Zephyr. Please set JIRA_PASSWORD or JIRA_API_TOKEN");
    }
    return headers;
};
// Public Zephyr Scale Server/DC API. Stable, documented. Covers test cases,
// test runs, results and folder creation (POST /folder).
export const createZephyrClient = (config) => axios.create({
    baseURL: `${resolveHost(config.host)}/rest/atm/1.0`,
    headers: buildAuthHeaders(config),
    timeout: 30000,
});
// Internal Zephyr Scale "tests" API that powers the Jira UI. Undocumented and
// version-sensitive across Jira/Zephyr upgrades. Used only where the public ATM
// API has no equivalent: reading the folder tree and deleting folders.
export const createZephyrTestsClient = (config) => axios.create({
    baseURL: `${resolveHost(config.host)}/rest/tests/1.0`,
    headers: buildAuthHeaders(config),
    timeout: 30000,
});
export const createConfiguredZephyrClient = () => createZephyrClient(getJiraConfig());
export const createConfiguredZephyrTestsClient = () => createZephyrTestsClient(getJiraConfig());
