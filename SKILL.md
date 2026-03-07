---
name: notion-mirror
description: "Sync Notion workspaces to local markdown files. Use when you need to read Notion content without API calls — pages and database rows are available as local markdown with YAML frontmatter."
---

# Notion Mirror Skill

Local markdown mirror of Notion workspaces. Content lives in the configured output directory (default: `~/repos/notion-content/`) as markdown files with YAML frontmatter.

## When to Use

- **Reading Notion content** — grep/cat local files instead of API calls
- **Searching across Notion** — `grep -r "keyword" ~/repos/notion-content/`
- **Checking page metadata** — frontmatter has ID, URL, last edited time
- **Cross-referencing** — combine with other local knowledge bases

## Structure

```
notion-content/
├── <workspace>/
│   ├── INDEX.md              # All pages and DBs listed
│   ├── pages/<slug>.md       # Standalone pages
│   └── databases/<db>/*.md   # One file per DB row
```

## Frontmatter

Every file has:
- `id` — Notion page/row ID
- `url` — Direct link to Notion
- `last_edited` — When the page was last changed in Notion
- `synced` — When the local copy was last updated
- Database rows also have all their properties as frontmatter fields

## Running a Sync

```bash
# Incremental (only changed since last sync)
cd ~/repos/notion-mirror && node src/index.js sync

# Full re-sync
cd ~/repos/notion-mirror && node src/index.js sync --full
```

The sync auto-commits to git, so you can `git log` to see what changed.

## Config

Located at `~/.config/notion-mirror/config.json`. Edit to add/remove workspaces.

## Tips

- Use `grep -rl "Status.*Urgent" ~/repos/notion-content/` to find urgent tasks
- Use `git diff HEAD~1` after a sync to see what changed in Notion
- INDEX.md files list all content with links for quick navigation
- Frontmatter `id` can be used for Notion API write-back operations
