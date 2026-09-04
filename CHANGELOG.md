# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/); нумерация версий — [Semantic Versioning](https://semver.org/lang/ru/).

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
