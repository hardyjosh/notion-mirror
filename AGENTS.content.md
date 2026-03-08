# AGENTS.md — Notion Content Mirror

## READ-ONLY — Do Not Edit These Files

This directory is an automated mirror of Notion workspaces. It is synced every 30 minutes by a system cron job. **Any local edits will be silently overwritten on the next sync.**

### Rules

1. **Never write to, edit, or create files in this directory.** Your changes will be lost.
2. **To update Notion content, use the Notion API.** Every file has a frontmatter `id` and `url` field — use the `id` for API calls, or reference the `url` to link the user to the page.
3. **If you don't have Notion API access, say so.** Do not fall back to editing the local mirror.
4. **This applies to all files** — pages, database rows, INDEX.md, everything.

### What You Can Do

- **Read** any file freely — that's the whole point
- **grep/search** across all content
- **Reference** frontmatter IDs for Notion API write operations
- **Link** users to Notion URLs from frontmatter

### What You Must Not Do

- Edit, append, or overwrite any `.md` file in this repo
- Create new files here (they'll be orphaned or deleted)
- Use this as scratch space or temp storage
