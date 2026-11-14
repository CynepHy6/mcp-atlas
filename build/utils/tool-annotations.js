/**
 * MCP-аннотации инструментов. Клиент (Cursor, Claude, Рабочий стол) по `readOnlyHint` решает,
 * спрашивать ли человека и пускать ли вызов в режимах только чтения. Без аннотации клиент угадывает
 * по имени, а имена здесь через дефис (`read-description`) и под его шаблоны не попадают.
 */
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
/** Только добавляет: создаёт задачу, комментарий, страницу, вложение, прогон или результат. */
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
/** Перезаписывает существующее или удаляет без возврата (спека MCP: всё, что не только добавляет). */
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
export const TOOL_ANNOTATIONS = {
    "read-description": READ_ONLY,
    "read-comments": READ_ONLY,
    "get-worklogs": READ_ONLY,
    "get-worklogs-by-days": READ_ONLY,
    "search-issues": READ_ONLY,
    "get-recent-worklogs": READ_ONLY,
    "list-attachments": READ_ONLY,
    // Пишет файл на диск машины агента и может перезаписать уже лежащий.
    "download-attachment": DESTRUCTIVE,
    "upload-attachment": WRITE,
    "create-issue": WRITE,
    "edit-issue": DESTRUCTIVE,
    "create-comment": WRITE,
    "edit-comment": DESTRUCTIVE,
    "get-insight-asset": READ_ONLY,
    "search-insight-assets": READ_ONLY,
    "inspect-zephyr-project": READ_ONLY,
    "upsert-zephyr-testcase": DESTRUCTIVE,
    "get-zephyr-testcase": READ_ONLY,
    "search-zephyr-testcases": READ_ONLY,
    "create-zephyr-testcase": WRITE,
    "update-zephyr-testcase": DESTRUCTIVE,
    "delete-zephyr-testcase": DESTRUCTIVE,
    "create-zephyr-testrun": WRITE,
    "send-zephyr-test-result": WRITE,
    "get-zephyr-folder-tree": READ_ONLY,
    "create-zephyr-folder": WRITE,
    "delete-zephyr-folder": DESTRUCTIVE,
    "create-confluence-page": WRITE,
    "edit-confluence-page": DESTRUCTIVE,
    "get-confluence-page": READ_ONLY,
    "search-confluence-pages": READ_ONLY,
};
/** Аннотации инструмента по имени. Незнакомое имя — ошибка: новый инструмент без пометки не регистрируется. */
export function toolAnnotations(name) {
    const annotations = TOOL_ANNOTATIONS[name];
    if (!annotations)
        throw new Error(`No MCP annotations for tool "${name}"`);
    return annotations;
}
