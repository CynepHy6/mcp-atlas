const INSIGHT_KEY_PATTERN = /^[A-Z]+-\d+$/i;
const INSIGHT_URL_PATTERN = /\/insight\/assets\/([A-Za-z]+-\d+)/i;
export const normalizeJiraHost = (host) => host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
export const buildInsightAssetUrl = (host, objectKey) => `${normalizeJiraHost(host)}/secure/insight/assets/${objectKey}`;
export const extractInsightObjectKey = (objectKeyOrUrl) => {
    const trimmed = objectKeyOrUrl.trim();
    const urlMatch = trimmed.match(INSIGHT_URL_PATTERN);
    if (urlMatch) {
        return { kind: "key", value: urlMatch[1].toUpperCase() };
    }
    if (/^\d+$/.test(trimmed)) {
        return { kind: "id", value: trimmed };
    }
    if (INSIGHT_KEY_PATTERN.test(trimmed)) {
        return { kind: "key", value: trimmed.toUpperCase() };
    }
    throw new Error(`Invalid Insight asset identifier: "${objectKeyOrUrl}". Expected object key (INFRA-123), numeric id, or Insight asset URL.`);
};
const formatAttributeValue = (value) => {
    if (value.referencedObject) {
        const ref = value.referencedObject;
        return `${ref.label} (${ref.objectKey})`;
    }
    return value.displayValue || value.value || "";
};
export const formatInsightObject = (object, host) => {
    const lines = [
        `# ${object.label}`,
        "",
        `- **Key:** ${object.objectKey}`,
        `- **Type:** ${object.objectType?.name || "Unknown"}`,
        `- **ID:** ${object.id}`,
        `- **URL:** ${buildInsightAssetUrl(host, object.objectKey)}`,
    ];
    if (object.created) {
        lines.push(`- **Created:** ${object.created}`);
    }
    if (object.updated) {
        lines.push(`- **Updated:** ${object.updated}`);
    }
    const attributes = object.attributes || [];
    const formattedAttributes = attributes
        .map((attribute) => {
        const name = attribute.objectTypeAttribute?.name;
        const values = (attribute.objectAttributeValues || [])
            .map(formatAttributeValue)
            .filter(Boolean);
        if (!name || values.length === 0) {
            return null;
        }
        const uniqueValues = [...new Set(values)];
        return `- **${name}:** ${uniqueValues.join(", ")}`;
    })
        .filter((line) => line !== null);
    if (formattedAttributes.length > 0) {
        lines.push("", "## Attributes", ...formattedAttributes);
    }
    return lines.join("\n");
};
export const formatInsightSearchResults = (response, host, queryLabel) => {
    const objects = response.objectEntries || [];
    if (objects.length === 0) {
        return `No Insight assets found for: ${queryLabel}`;
    }
    const total = response.totalFilterCount ?? objects.length;
    const lines = [
        `Found ${objects.length} asset(s) for: ${queryLabel}`,
        total > objects.length
            ? `(showing ${objects.length} of ${total} total matches)`
            : "",
        "",
    ].filter(Boolean);
    objects.forEach((object, index) => {
        lines.push(`${index + 1}. **${object.label}** (${object.objectKey})`, `   - Type: ${object.objectType?.name || "Unknown"}`, `   - URL: ${buildInsightAssetUrl(host, object.objectKey)}`, "");
    });
    return lines.join("\n").trim();
};
