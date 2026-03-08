# 🪞 notion-mirror

Mirror your Notion workspaces to local markdown files with incremental sync.

## Why?

Notion is great for collaboration but terrible for fast local access. API calls add latency, cost tokens when used by AI agents, and make grep impossible. This tool syncs your Notion content to a local git repo — giving you instant reads, full-text search, and version history for free.

**How it works:**

1. **First run**: pulls every page and database the integration can see
2. **Subsequent runs**: only fetches pages/rows edited since last sync (using Notion's `last_edited_time`)
3. **Output**: markdown files with YAML frontmatter (page metadata, properties, links back to Notion)
4. **Git**: auto-commits after each sync so you get full change history

## Setup

```bash
# Install deps
npm install

# Install the OpenClaw skill (optional, for AI agent integration)
./setup.sh

# Generate config template
node src/index.js init

# Edit ~/.config/notion-mirror/config.json with your API keys and output path
```

### Config

```json
{
  "outputDir": "~/repos/notion-content",
  "gitCommit": true,
  "workspaces": [
    {
      "name": "Personal",
      "apiKeyFile": "~/.config/notion/personal_api_key",
      "subdir": "personal"
    },
    {
      "name": "Work",
      "apiKeyFile": "~/.config/notion/work_api_key",
      "subdir": "work"
    }
  ]
}
```

- **outputDir**: where markdown files go (separate repo from this tool)
- **apiKeyFile**: path to a file containing your Notion integration token
- **subdir**: subdirectory per workspace within outputDir

## Usage

```bash
# Incremental sync (only changed pages)
node src/index.js sync

# Full sync (re-download everything)
node src/index.js sync --full
```

## AI Agent Integration

notion-mirror is designed to work with AI agents (OpenClaw, Claude, etc.). The content repo is **read-only** for agents — they should read from it freely but never write to it.

### How it works

- **`AGENTS.md`** is automatically copied into the content repo on every sync if it's missing. This file tells agents the mirror is read-only and to use the Notion API for writes.
- **`SKILL.md`** can be installed into an OpenClaw workspace via `./setup.sh`. It teaches agents how to search the mirror and reinforces the read-only rule.
- **Frontmatter** on every file includes the Notion page `id` and `url`, so agents can reference or link back to the original for write operations.

Upgrading the tool automatically updates the AGENTS.md in the content repo on the next sync.

### Setup script

```bash
./setup.sh
```

This copies `SKILL.md` into your OpenClaw workspace skills directory (`~/.openclaw/workspace/skills/notion-mirror/`). It also prints the cron line to add.

## Output structure

```
notion-content/
├── AGENTS.md                 # Read-only instructions for AI agents
├── personal/
│   ├── INDEX.md
│   ├── pages/
│   │   ├── meeting-notes-feb-12.md
│   │   └── project-spec.md
│   └── databases/
│       ├── tasks/
│       │   ├── INDEX.md
│       │   ├── fix-the-bug.md
│       │   └── write-docs.md
│       └── contacts/
│           ├── INDEX.md
│           └── ...
├── work/
│   └── ...
```

Each file has YAML frontmatter:

```yaml
---
id: "abc123..."
title: "Fix the bug"
database: "Tasks"
url: "https://notion.so/abc123..."
last_edited: "2026-03-07T17:35:00.000Z"
synced: "2026-03-07T21:00:00.000Z"
Status: "In Progress"
Priority: "Urgent"
---

Page content here as markdown...
```

## Cron

Run on a system cron (no AI tokens burned):

```bash
# Every 30 minutes
*/30 * * * * cd /path/to/notion-mirror && node src/index.js sync >> /tmp/notion-mirror.log 2>&1
```

## Limitations

- Notion API rate limit: 3 requests/second. Large workspaces may take a few minutes on full sync.
- Files/images in Notion use expiring URLs — they won't persist in markdown. Consider this a text mirror.
- Database `last_edited_time` only updates on schema changes, not row edits. Row-level incremental sync uses per-row timestamps via the query endpoint.

## License

MIT
