---
name: notion-mirror
description: "Sync Notion workspaces to local markdown files. Use when you need to read Notion content without API calls — pages and database rows are available as local markdown with YAML frontmatter."
---

# Notion Mirror Skill

Local markdown mirror of Notion workspaces. Content lives at `~/repos/notion-content/` as markdown files with YAML frontmatter.

## Important: Auto-Sync is Running

A system cron syncs every 30 minutes. **Do not run a sync unless explicitly asked.** The local files are always reasonably fresh.

If the user asks you to sync manually:
```bash
cd ~/repos/notion-mirror && node src/index.js sync        # incremental
cd ~/repos/notion-mirror && node src/index.js sync --full  # full re-download
```

## When to Use

- **Reading Notion content** — grep/cat local files instead of API calls
- **Searching across Notion** — `grep -r "keyword" ~/repos/notion-content/`
- **Checking page metadata** — frontmatter has ID, URL, last edited time
- **Cross-referencing** — combine with other local knowledge bases

**Never use the Notion API to read content.** The local mirror has everything. Only use the API for writes (creating/updating pages).

## Structure

```
notion-content/
├── personal/
│   ├── INDEX.md              # All pages and DBs listed
│   ├── pages/<slug>.md       # Standalone pages
│   └── databases/
│       ├── tasks/            # The backlog
│       ├── pr-triage/
│       ├── x-content-pipeline/
│       └── rain-audit-tracker/
├── st0x/
│   ├── INDEX.md
│   ├── pages/
│   └── databases/
│       └── bd-targets/       # 752 distribution partners
```

## Frontmatter

Every file has:
- `id` — Notion page/row ID (use for API write-back)
- `url` — Direct link to Notion
- `last_edited` — When the page was last changed in Notion
- `synced` — When the local copy was last updated
- Database rows also have all their properties as frontmatter fields

## Tips

- `grep -rl "Status.*Urgent" ~/repos/notion-content/personal/databases/tasks/` — find urgent backlog items
- `grep -r "keyword" ~/repos/notion-content/` — search everything
- `git -C ~/repos/notion-content log --oneline -5` — see recent sync history
- `cat /tmp/notion-mirror.log | tail -20` — check cron sync logs
