import axios from "axios";
import { getJiraConfig } from "./jira-client.js";
export const createInsightClient = (config) => {
    let host = config.host;
    if (host.includes("://")) {
        host = new URL(host).href.replace(/\/$/, "");
    }
    else {
        host = `https://${host}`;
    }
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
        throw new Error("No authentication method configured for Insight. Please set JIRA_PASSWORD or JIRA_API_TOKEN");
    }
    return axios.create({
        baseURL: `${host}/rest/insight/1.0`,
        headers,
        timeout: 15000,
    });
};
export const createConfiguredInsightClient = () => createInsightClient(getJiraConfig());
