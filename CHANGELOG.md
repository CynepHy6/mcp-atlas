# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/); нумерация версий — [Semantic Versioning](https://semver.org/lang/ru/).

## [1.11.0] - 2026-11-14

### Добавлено

- **`read-description`:** опциональные параметры `includeComments` (по умолчанию `false`) и `commentsLimit` для получения описания, структуры связей и последних N комментариев одним вызовом со счётчиком `showing last N of M total`; поддержка передачи browse URL в `issueKey`.
- **`read-comments`:** опциональный параметр `limit` (последние N комментариев со счётчиком пропущенных; на пагинированных задачах без явного `limit` догрузка хвоста ограничена одной хвостовой страницей на 50 комментариев вместо выкачки всех страниц) и поддержка browse URL в `issueKey`.
- **`get-confluence-page`:** параметр `bodyFormat: "compact" | "storage"` (по умолчанию `"compact"` — конвертация Confluence Storage XHTML в читаемый Markdown с поддержкой заголовков, списков, таблиц, макросов `code`/`noformat`/`jira`/`status`/`info`/`expand`, ссылок и зачёркивания `<s>`/`<del>`/`line-through` → `~~...~~`; `"storage"` — сырой Storage XHTML для последующей правки через `edit-confluence-page`), опциональный `commentsLimit` (ограничивает число возвращаемых последних комментариев при `includeComments: true`) и вывод HTTP-статуса и текста ошибки API при сбое чтения.

### Изменено

- **`read-description` и `getIssueStructure`:** вместо `fields: ["*all"]` запрашивается целевой набор полей (`ISSUE_DESCRIPTION_FIELDS` / `ISSUE_STRUCTURE_FIELDS`), устранён повторный запрос `getIssue` на ту же задачу при построении структуры связей.
- **`search-issues` (и `formatSearchResults`):** дефолт `includeDescription` изменён с `true` на `false` (при `false` поле `description` не запрашивается в JQL-поиске и не печатается в выдаче).
- **`get-confluence-page`:** загрузка комментариев страницы выключена по умолчанию (`includeComments: false`), чтобы не делать лишних HTTP-запросов `/child/comment`, когда комментарии не нужны.

## [1.10.0] - 2026-11-04

### Добавлено

- У каждого инструмента есть MCP-аннотации: `readOnlyHint: true` у чтения и поиска (Jira, Insight, Zephyr, Confluence, список вложений), `readOnlyHint: false` у создания, правки, загрузки и `download-attachment` (пишет файл на диск), `destructiveHint: true` у тех, что перезаписывают или удаляют: правка задачи, комментария, страницы и тест-кейса, `upsert-zephyr-testcase`, `download-attachment` и оба `delete-*`. Клиент больше не угадывает по имени: читающие инструменты идут без вопроса человеку и работают в режимах только чтения.

### Изменено

- Нижняя граница `@modelcontextprotocol/sdk` — `^1.11.0`: аннотации в `server.tool` появились в этой версии.

## [1.9.1] - 2026-10-01

### Изменено

- **`upload-attachment`** больше не дописывает `!filename|thumbnail!` в description. Tool только загружает файл и возвращает эту wiki-строку; куда её вставить, решает вызывающий (`edit-issue` или `create-comment`).

## [1.9.0] - 2026-10-01

### Добавлено

- **`upload-attachment`** — загружает локальный файл на задачу Jira по ключу или browse URL и дописывает в description превью `!filename|thumbnail!`, не затирая уже написанный текст. Имя на задаче можно задать через `filename`. Локальный лимит чтения — 50 МБ; больший файл Jira не вызывается.

## [1.8.0] - 2026-09-30

### Добавлено

- `read-description` печатает строку `Labels` (или `(none)`, если меток нет).
- `edit-issue`: `addLabels` и `removeLabels` добавляют или снимают метки, не трогая остальные и не требуя description. `labels` по-прежнему заменяет весь список.

## [1.7.0] - 2026-09-29

### Добавлено

- **`create-comment`** — комментарий к задаче по ключу или browse URL (`body` в wiki markup).
- **`edit-comment`** — замена текста комментария по `commentId` из `read-comments`; `notifyUsers` необязателен (если не передан, остаётся дефолт Jira).

### Изменено

- `read-comments` печатает `Id` комментария, чтобы его можно было передать в `edit-comment`.

## [1.6.1] - 2026-09-04

### Добавлено

- **`edit-issue`** — правка существующей задачи по ключу или browse URL; передаются только изменяемые поля (description заменяет тело целиком, wiki markup).

## [1.6.0] - 2026-09-04

### Добавлено

- **`create-issue`** — создание задачи Jira (`projectKey`, `issueType`, `summary`; опционально description в wiki markup, `parentKey`, assignee, priority, labels, components, dueDate, `additionalFields`).

## [1.5.4] - 2026-07-06

### Добавлено

- **`list-attachments`** — метаданные вложений задачи Jira (`id`, `filename`, `mimeType`, `size`, `created`, `author`, `contentUrl`, `thumbnailUrl`).
- **`download-attachment`** — скачивает бинарник вложения на диск. Идентификация по `attachmentId` (предпочтительно) или `issueKey` + `filename`; параметры `saveDir` (по умолчанию cwd MCP-сервера) и `overwrite`. Возвращает путь к сохранённому файлу и метаданные.

## [1.4.0] - 2026-06-06

### Добавлено

- **`get-zephyr-folder-tree`** — дерево папок проекта (`folderId / items / полный путь`); принимает projectKey, числовой projectId или Tests.jspa URL с `projectId=`.
- **`create-zephyr-folder`** — создание папки по `projectKey` + `name`/`parentPath` + `type` (официальный `atm/1.0 POST /folder`).
- **`delete-zephyr-folder`** — удаление папки по `folderId` (`confirm: true` обязателен).
- Чтение дерева и удаление папок используют внутренний `/rest/tests/1.0` API (новый клиент `createZephyrTestsClient`) — недокументированный, чувствителен к версии Jira/Zephyr; создание папок — на официальном `atm/1.0`.

### Изменено

- Репозиторий переименован `mcp-jira` → `mcp-atlas` (ссылки в `package.json`, `README.md`, `AGENTS.md`, конфигах и CI).
- CI `publish-dist`: `paths`-фильтр на push (запуск только при изменении кода/манифеста) и гейт по версии (publish/compile только если тег `v{version}` ещё не выпущен); `README.md`/`AGENTS.md` больше не копируются в ветку `dist`.

## [1.3.7] - 2026-06-06

### Изменено

- `README.md`, `AGENTS.md`: уточнено поведение кэша `npx` для `github:` ref; убраны вводящие в заблуждение формулировки про автообновление и ref `#dist`.

## [1.3.6] - 2026-06-05

### Изменено

- `MCP_SERVER_INSTRUCTIONS`: убраны формулировки про HTTP/503/сессию (агент пересказывал их пользователю); добавлено правило не meta-commentить tools/доступ в ответе.
- `AGENTS.md`: раздел про `MCP_SERVER_INSTRUCTIONS`, тон user-facing ответов и Tests.jspa-маршрутизацию.

## [1.3.5] - 2026-06-05

### Изменено

- Маршрутизация Jira/Zephyr/Insight: `instructions` на уровне MCP-сервера (`MCP_SERVER_INSTRUCTIONS`); дубли про Tests.jspa/WebFetch/projectId убраны из descriptions Zephyr-tools.

## [1.3.4] - 2026-06-05

### Изменено

- Zephyr tools: в MCP descriptions добавлены заметки про 503 на Tests.jspa (UI только с Jira-сессией) и про `projectId` vs `projectKey`; дубли убраны из AGENTS.md.

## [1.3.3] - 2026-06-05

### Исправлено

- `npx github:...` падал из‑за скрипта `"build"` в `package.json` ([npm/cli#4003](https://github.com/npm/cli/issues/4003)): скрипт переименован в `compile`; в ветке `dist` — runtime-only manifest без `devDependencies` и compile-скриптов.

## [1.3.2] - 2026-06-05

### Добавлено

- Запуск через `npx -y github:CynepHy6/mcp-jira#semver:^1` без клона: `bin`, shebang, GitHub Action публикует `build/` в ветку `dist` и тег `v{version}`.

### Изменено

- README: npx quick start; локальный клон — альтернатива.
- `mcp-config.example.json` — пример с npx и `env`.

## [1.3.1] - 2026-06-05

### Добавлено

- **`delete-zephyr-testcase`** — удаление test case по ключу или URL (`confirm: true` обязателен).

### Изменено

- Документация: подробный [AGENTS.md](AGENTS.md) для агентов; [README.md](README.md) сокращён до quick start.

## [1.3.0] - 2026-06-05

### Добавлено

- Инструменты Zephyr Scale (REST `/rest/atm/1.0`): `get-zephyr-testcase`, `search-zephyr-testcases`, `create-zephyr-testcase`, `update-zephyr-testcase`, `create-zephyr-testrun`, `send-zephyr-test-result`.
- **`inspect-zephyr-project`** и **`upsert-zephyr-testcase`** — основной agent-friendly flow для синхронизации test-wdio ↔ Zephyr (create/update по `#PREFIX-Tnnn` в `it()`).
- Чтение и запись test cases / test runs / test results через тот же Jira PAT (`JIRA_API_TOKEN`).

## [1.2.0] - 2026-06-05

### Добавлено

- Инструмент `get-insight-asset` для получения объектов Jira Insight (Assets) по ключу, id или URL.
- Инструмент `search-insight-assets` для поиска объектов Insight через IQL.

## [1.1.1] - 2026-05-18

### Добавлено

- Инструмент `edit-confluence-page` для редактирования заголовка и содержимого страниц Confluence по ID или URL.

### Исправлено

- В `get-confluence-page` дата создания теперь берется из реального ответа Confluence (`history.createdDate` с запасным вариантом `version.when`) без `Invalid Date`.

## [1.1.0] - 2026-05-18

### Добавлено

- Инструмент `create-confluence-page` для создания страниц Confluence, включая дочерние страницы по ID или URL родителя.

## [1.0.1] - 2026-04-20

### Добавлено

- Задачи из эпика и оценка времени.

## [1.0.0] - 2025-10-06

### Добавлено

- MCP-сервер для Jira и Confluence (Jira Server/DC и Cloud).
- Инструмент получения ворклогов.
- Поддержка Confluence: контент страниц, поиск, метаданные.
- Поиск задач в Jira.
- Получение связей задач.
