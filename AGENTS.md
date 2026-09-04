# mcp-atlas — инструкции для агента

MCP-сервер: Jira, Confluence, Insight (Assets), Zephyr Scale. Точка входа — `src/index.ts` (регистрация tools + `instructions`), маршрутизация URL → tools — `src/utils/mcp-server-instructions.ts`. После правок: `npm run compile`, **поднять `version` в `package.json`**, push в `master` (CI → `dist` + git-тег `v{version}`) и reload MCP в Cursor.

Подробности для людей — [README.md](README.md). История версий — [CHANGELOG.md](CHANGELOG.md).

## Конфигурация

### npx (без клона)

```json
{
  "command": "npx",
  "args": ["-y", "github:CynepHy6/mcp-atlas#semver:^1"],
  "env": {
    "JIRA_HOST": "https://jira.example.com",
    "JIRA_USERNAME": "login",
    "JIRA_API_TOKEN": "pat"
  }
}
```

Креды **только в `env` MCP-конфига**. `dotenv` из `.env` пакета не рассчитан на этот режим.

Релиз: bump `version` в `package.json` → push `master` → CI → `dist` + git-тег `v{version}`.

**Скрипт сборки — `compile`, не `build`:** см. `.cursor/rules/mcp-server-development.mdc` (npm/cli#4003). На `dist` уходит runtime-only `package.json` без `devDependencies` и compile-скриптов.

**Ref в `args`** (теги совпадают с `v` + `package.json` version):

```json
"github:CynepHy6/mcp-atlas#semver:^1"
"github:CynepHy6/mcp-atlas#v1.3.2"
"github:CynepHy6/mcp-atlas#semver:1.3.2"
```

- `#semver:^1` — максимальный git-тег `v1.x` на момент установки.
- `#v1.3.2` — конкретная версия.
- `#semver:1.3.2` — та же версия через semver-resolver.

`#semver:^1` обычно подтягивает новый `v1.x` при старте MCP; pinned ref (`#v1.3.2`) — нет. Sandbox: `~/.npm/_npx/<hash>/`. Если залипло: `npx clear-npx-cache`, reload MCP.

### Локальный клон

- `git clone https://github.com/CynepHy6/mcp-atlas.git`
- `.env` в корне репозитория (см. `.env.example`). `index.ts` подхватывает его через `dotenv` из `build/` → `../.env`.
- Cursor MCP: `node` + `build/index.js`; переменные можно задать в `env` блока MCP или только в `.env`.
- **Jira Server/Data Center** (`*.skyeng.link` и аналоги): PAT → `Authorization: Bearer` (`src/clients/jira-client.ts`).
- **Atlassian Cloud**: email + API token → Basic Auth.
- Confluence — отдельные `CONFLUENCE_*`; **`CONFLUENCE_API_TOKEN` ≠ `JIRA_API_TOKEN`** (токены создаются отдельно, username может совпадать). Insight использует `JIRA_*`.

## Структура кода

```text
src/
  index.ts              # регистрация MCP tools, auth check при старте
  clients/
    jira-client.ts      # jira.js Version2Client
    confluence-client.ts
    insight-client.ts   # axios → /rest/insight/1.0
    zephyr-client.ts    # axios → /rest/atm/1.0
  tools/
    jira/               # issues, worklogs
    confluence/
    insight/
    zephyr/             # test cases, runs, results
  utils/
    zephyr-utils.ts     # форматирование, extract key из URL
    zephyr-wdio-sync.ts # parse it(), upsert helpers, inspect project
    validation.ts       # проверка env
tests/
  tools/                # nock-интеграции handlers
  src/                  # unit-тесты utils
```

**Паттерн нового tool:** `tools/<area>/<name>.ts` экспортирует `*Schema` (zod) и `*Handler(client, config)` → регистрация в `index.ts` через `server.tool(...)`.

## `MCP_SERVER_INSTRUCTIONS`

Единая маршрутизация URL → tools: `src/utils/mcp-server-instructions.ts` → `InitializeResult.instructions` в `src/index.ts`. Cursor подмешивает её агенту как `serverUseInstructions` на каждый ход.

**Содержит:** Jira issue → `read-description`; создание задачи → `create-issue`; Zephyr (`Tests.jspa`, `*-Tnnn`) → tools этого сервера, без WebFetch/curl UI-URL; `projectId` в hash UI → `projectKey` (`test-wdio --qaseProject`); Insight asset URL → `get-insight-asset` / `search-insight-assets`.

**Не дублировать** те же правила в descriptions отдельных tools — только в `MCP_SERVER_INSTRUCTIONS`.

**Тон ответа пользователю:** instructions задают поведение агента, не преамбулу к ответу. Отдавать полученные данные; не объяснять HTTP/auth/MCP/WebFetch и не называть tool, если пользователь сам не спросил, как данные получены.

**При правке instructions:** только поведенческие указания. Не добавлять формулировки вроде «503», «нужна сессия», «UI не открывается по HTTP» — агент их пересказывает пользователю. Тест: `tests/src/mcp-server-instructions.test.ts`.

## Какой tool вызывать

### Jira issues (начинать с задачи)

| Задача | Tool |
|--------|------|
| Контекст по тикету | `read-description`, затем `read-comments` |
| Создать задачу | `create-issue` (`projectKey`, `issueType`, `summary`; description — Jira wiki markup; Sub-task — `parentKey`) |
| Поиск связанных задач | `search-issues` |
| Ворклоги | `get-recent-worklogs`, `get-worklogs-by-days`, `get-worklogs` |
| Вложения: список | `list-attachments` (id, filename, mimeType, size, contentUrl) |
| Вложения: скачать | `download-attachment` (`attachmentId` или `issueKey`+`filename`, `saveDir`, `overwrite`) |

`create-issue`: description — **Jira wiki markup**, не Markdown. Sub-task без `parentKey` tool отклоняет локально. Обязательные custom fields проекта — в `additionalFields` (ответ 400 от Jira перечисляет недостающие).

### Insight (Assets)

| Задача | Tool |
|--------|------|
| Объект по ключу/URL | `get-insight-asset` |
| Поиск IQL | `search-insight-assets` |

### Confluence

| Задача | Tool |
|--------|------|
| Прочитать страницу | `get-confluence-page` |
| Найти страницу | `search-confluence-pages` |
| Создать / править | `create-confluence-page`, `edit-confluence-page` |

Контент — **Confluence Storage Format** (HTML/XML).

### Zephyr Scale

| Задача | Tool |
|--------|------|
| Незнакомый проект, custom fields, папки | **`inspect-zephyr-project`** |
| Sync после правок test-wdio | **`upsert-zephyr-testcase`** |
| Прочитать один кейс | `get-zephyr-testcase` |
| Найти кейс / reference для custom fields | `search-zephyr-testcases` |
| Удалить устаревший кейс | `delete-zephyr-testcase` (`confirm: true`, сначала `get`) |
| CI: test run + результат | `create-zephyr-testrun`, `send-zephyr-test-result` |
| Низкоуровневый create/update | `create-zephyr-testcase`, `update-zephyr-testcase` |

**Primary для test-wdio:** `inspect-zephyr-project` → `upsert-zephyr-testcase`. Остальные — вспомогательные.

**Tests.jspa URL:** `#/testCase/KEY` → `get-zephyr-testcase` / update / delete (ключ из URL). `#/v2/testCases?projectId=…` — только навигация UI; для API/search передавать `projectKey`, не numeric `projectId`.

## test-wdio ↔ Zephyr

Связь в коде: суффикс в `it('... #PREFIX-Tnnn')`. Reporter шлёт результаты прогона по **ключу из title**, не по `--qaseProject`.

### Upsert-логика

- `wdioItTitle` — полная строка `it('...')`.
- Есть `#PREFIX-Tnnn` в конце → **update** кейса с этим ключом.
- Нет суффикса → **create**; нужен `projectKey` (= `--qaseProject` в wdio) или `inheritCustomFieldsFrom`.
- Поля: `precondition`, `testScriptPlainText` (многострочные шаги), опционально `folder`, `customFields`, `automationStatus`.

После create tool возвращает строку для добавления `#KEY-Tnnn` в `it()`.

### Ограничения Zephyr API (важно)

- Ключ кейса (`PROJ-T123`) **не переименовать** — смена id = create нового + правка wdio + delete старого.
- **Папку** меняют через update (`folder`), ключ тот же.
- **projectKey** у существующего кейса не переносят — другой проект = новый кейс.
- На create часто обязательны **project-specific `customFields`** — брать из `inspect-zephyr-project` или `inheritCustomFieldsFrom`.
- PUT/POST testcase: в `testScript.steps` **без** полей `index`/`id` (только `description`, опционально `testData`, `expectedResult`).
- `testScriptPlainText` конвертируется в STEP_BY_STEP с `<br />` (`src/utils/zephyr-wdio-sync.ts`).

### Миграция «старый ключ → новый»

1. Create новых кейсов (`upsert` без `#` в title или с новым projectKey).
2. Обновить `#…` в test-wdio spec.
3. `get-zephyr-testcase` → `delete-zephyr-testcase` для каждого obsolete ключа.

## Отладка

```bash
npm run compile
./test-tool.sh create-issue '{"projectKey":"PROJ","issueType":"Task","summary":"Example task","description":"h2. What\\n\\nDo the thing"}'
./test-tool.sh upsert-zephyr-testcase '{"projectKey":"PROJ","wdioItTitle":"Example test","testScriptPlainText":"Шаг 1: action"}'
./test-tool.sh delete-zephyr-testcase '{"testCaseKeyOrUrl":"PROJ-T123","confirm":true}'
```

Тесты: `npm test`. После изменений в `src/` — `npm run compile` + точечный тест в `tests/tools/` или `tests/src/`.

## Частые ошибки API

| Симптом | Причина |
|---------|---------|
| 401 | неверный PAT / не Bearer для Server DC |
| 400 `Required custom fields` | не переданы `customFields` на create |
| 400 `option X was not found` | неверное значение custom field для проекта |
| 500 `Unrecognized field "index"` | в steps попали поля из GET-ответа |

## Чего нет

- Переименование/clone testcase одним вызовом.

## Вложения Jira

- `list-attachments` — берёт `fields.attachment` задачи и отдаёт структурированный список (`id`, `filename`, `mimeType`, `size`, `created`, `author`, `contentUrl`, опц. `thumbnailUrl`).
- `download-attachment` — сохраняет бинарник вложения на диск. Идентификация:
 - `attachmentId` (предпочтительно) — `GET /rest/api/2/attachment/{id}` за метаданными через axios + Bearer;
 - иначе `issueKey` + `filename` — грузит список вложений задачи (`jira.issues.getIssue`, `fields=attachment`) и берёт первое совпадение по имени.
- Скачивание контента идёт **напрямую по `content` URL из метаданных** (axios, `responseType: arraybuffer`, Bearer/Basic auth). Endpoint `/rest/api/2/attachment/content/{id}` библиотеки `jira.js` на Jira Server/DC у Skyeng отдаёт 404 — поэтому используется web-URL `https://…/secure/attachment/{id}/{filename}`.
- **Skyeng gandalf/SSO bypass:** для скачивания бинарника с `/secure/attachment/*` к запросу может добавляться кастомный заголовок reverse-proxy. Имя и значение берутся из env `JIRA_CUSTOM_HEADER` в формате `Header-Name: value` (например `x-yandex-customheader:<corporate-token>`). Без этого env web-URL `/secure/attachment/*` на деплое Skyeng редиректит на Yandex Browser SSO даже с Bearer; с заголовком Bearer доходит до Jira. Код не содержит хардкода ни имени, ни значения — это корпоративный секрет, его место в env MCP-конфига, не в публичном репо.
- `saveDir` по умолчанию = `process.cwd()` MCP-сервера (обычно корень воркспейса в Cursor); каталог создаётся рекурсивно. `overwrite=false` по умолчанию — при существующем файле возвращает ошибку, не затирая.
- Имя файла санитаризуется (`path.basename` + замена разделителей), расширения сохраняются.
- Возвращает путь к сохранённому файлу и метаданные (`id`, `filename`, `mimeType`, размер на диске, `sourceUrl`). Не возвращает base64 inline — только диск.

Не хардкодить в docs и tool descriptions внутренние ключи проектов компании — использовать нейтральные `PROJ-T123`.
