# mcp-atlas

MCP-сервер для **Jira**, **Confluence**, **Insight (Assets)** и **Zephyr Scale** в Cursor.

## Быстрый старт (npx, без клона)

1. Добавить в Cursor MCP (`~/.cursor/mcp.json` или project config):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "github:CynepHy6/mcp-atlas#semver:^1"],
      "env": {
        "JIRA_HOST": "https://jira.example.com",
        "JIRA_USERNAME": "your_login",
        "JIRA_API_TOKEN": "your_jira_pat",
        "CONFLUENCE_HOST": "https://confluence.example.com",
        "CONFLUENCE_USERNAME": "your_login",
        "CONFLUENCE_API_TOKEN": "your_confluence_pat"
      }
    }
  }
}
```

Креды передаются **только через `env`** в MCP-конфиге (файл `.env` рядом с репозиторием при npx не используется).

| Переменная | Нужна для | Примечание |
|------------|-----------|------------|
| `JIRA_HOST` | Jira, Insight, Zephyr | URL инстанса Jira |
| `JIRA_USERNAME` | Jira, Insight, Zephyr | Логин или email (Cloud) |
| `JIRA_API_TOKEN` | Jira, Insight, Zephyr | PAT Jira (отдельный от Confluence) |
| `CONFLUENCE_HOST` | Confluence | URL инстанса Confluence |
| `CONFLUENCE_USERNAME` | Confluence | Если не задан — берётся `JIRA_USERNAME` |
| `CONFLUENCE_API_TOKEN` | Confluence | PAT Confluence (создаётся отдельно от Jira) |

Insight и Zephyr используют те же `JIRA_*`, отдельных переменных нет. **`JIRA_API_TOKEN` и `CONFLUENCE_API_TOKEN` — разные токены** (даже на одном домене Server/DC); логин можно указать один и тот же.

2. Reload MCP в Cursor.

### Версия в `args`

`npx` скачивает пакет из GitHub по адресу `github:CynepHy6/mcp-atlas`. Суффикс после `#` выбирает, **какую версию** установить:

- каждый релиз помечен git-тегом вида `v1.3.2` (история — в [CHANGELOG.md](CHANGELOG.md));
- `npx` сохраняет установку в `~/.npm/_npx/<hash>/`, где hash зависит от строки в `args`.

| Ref | Пример `args` | Когда использовать |
|-----|---------------|-------------------|
| диапазон `v1.x` | `["-y", "github:CynepHy6/mcp-atlas#semver:^1"]` | по умолчанию; при старте MCP подтягивает максимальный git-тег `v1.x` |
| конкретный тег | `["-y", "github:CynepHy6/mcp-atlas#v1.3.2"]` | зафиксировать версию |
| exact semver | `["-y", "github:CynepHy6/mcp-atlas#semver:1.3.2"]` | то же, через semver (ищет тег `v1.3.2`) |

**Обновление:** с `#semver:^1` новый релиз `v1.x` обычно подтягивается при старте MCP — reload Cursor чаще всего достаточно. С `#v1.3.2` версия зафиксирована: смените ref или удалите sandbox. Если не помогло — `npx clear-npx-cache` и снова reload MCP.

## Альтернатива: локальный клон

```bash
git clone https://github.com/CynepHy6/mcp-atlas.git
cd mcp-atlas
cp .env.example .env   # заполнить креды
npm install && npm run compile
```

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-atlas/build/index.js"]
    }
  }
}
```

Креды можно держать в `.env` в корне клонированного репозитория.

## Что умеет

- **Jira** — описание/комментарии, создание, правка и поиск issues, ворклоги
- **Insight** — объекты Assets по ключу и IQL
- **Confluence** — чтение, поиск, создание и правка страниц
- **Zephyr** — test cases (read/create/update/delete), test runs, результаты прогонов

## Документация

| Файл | Для кого |
|------|----------|
| [AGENTS.md](AGENTS.md) | разработка, workflows, API-ограничения |
| [CHANGELOG.md](CHANGELOG.md) | история релизов |
| [mcp-config.example.json](mcp-config.example.json) | MCP-конфиг npx, диапазон `v1.x` (`#semver:^1`) |
