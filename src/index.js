#!/usr/bin/env node

import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// --- Config ---

const CONFIG_PATH =
  process.env.NOTION_MIRROR_CONFIG ||
  path.join(process.env.HOME, ".config/notion-mirror/config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}`);
    console.error("Create one with: notion-mirror init");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

// --- State ---

function loadState(outputDir) {
  const statePath = path.join(outputDir, ".notion-mirror-state.json");
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  }
  return { lastSync: null, pages: {}, databases: {} };
}

function saveState(outputDir, state) {
  const statePath = path.join(outputDir, ".notion-mirror-state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// --- Notion helpers ---

function getPlainTitle(page) {
  // For pages: find the title property
  const props = page.properties || {};
  for (const [, val] of Object.entries(props)) {
    if (val.type === "title") {
      const arr = val.title;
      if (Array.isArray(arr)) return arr.map((t) => t.plain_text).join("");
      return "";
    }
  }
  // For databases
  if (page.title) {
    if (Array.isArray(page.title)) {
      return page.title.map((t) => t?.plain_text || "").join("");
    }
    if (typeof page.title === "string") return page.title;
  }
  return "Untitled";
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function formatProperty(val) {
  if (!val) return "";
  switch (val.type) {
    case "title":
      return (val.title || []).map((t) => t.plain_text).join("");
    case "rich_text":
      return (val.rich_text || []).map((t) => t.plain_text).join("");
    case "number":
      return val.number != null ? String(val.number) : "";
    case "select":
      return val.select?.name || "";
    case "multi_select":
      return (val.multi_select || []).map((s) => s.name).join(", ");
    case "status":
      return val.status?.name || "";
    case "date":
      if (!val.date) return "";
      return val.date.end
        ? `${val.date.start} → ${val.date.end}`
        : val.date.start;
    case "checkbox":
      return val.checkbox ? "true" : "false";
    case "url":
      return val.url || "";
    case "email":
      return val.email || "";
    case "phone_number":
      return val.phone_number || "";
    case "people":
      return (val.people || []).map((p) => p.name || p.id).join(", ");
    case "relation":
      return (val.relation || []).map((r) => r.id).join(", ");
    case "rollup":
      if (val.rollup?.type === "number") return String(val.rollup.number ?? "");
      if (val.rollup?.type === "array")
        return val.rollup.array.map((v) => formatProperty(v)).join(", ");
      return "";
    case "formula":
      if (val.formula?.type === "string") return val.formula.string || "";
      if (val.formula?.type === "number")
        return String(val.formula.number ?? "");
      if (val.formula?.type === "boolean")
        return String(val.formula.boolean ?? "");
      if (val.formula?.type === "date")
        return val.formula.date?.start || "";
      return "";
    case "files":
      return (val.files || [])
        .map((f) => f.file?.url || f.external?.url || f.name)
        .join(", ");
    case "created_time":
      return val.created_time || "";
    case "last_edited_time":
      return val.last_edited_time || "";
    case "created_by":
      return val.created_by?.name || val.created_by?.id || "";
    case "last_edited_by":
      return val.last_edited_by?.name || val.last_edited_by?.id || "";
    default:
      return "";
  }
}

// --- Markdown conversion ---

async function pageToMarkdown(n2m, notion, pageId) {
  try {
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const mdString = n2m.toMarkdownString(mdBlocks);
    return mdString.parent || "";
  } catch (err) {
    return `<!-- Error converting page: ${err.message} -->`;
  }
}

// --- Sync logic ---

async function syncWorkspace(workspaceConfig, outputDir, fullSync) {
  const apiKey = workspaceConfig.apiKeyFile
    ? fs.readFileSync(workspaceConfig.apiKeyFile, "utf-8").trim()
    : workspaceConfig.apiKey;

  const notion = new Client({ auth: apiKey });
  const n2m = new NotionToMarkdown({ notionClient: notion });

  const state = loadState(outputDir);
  const lastSync = fullSync ? null : state.lastSync;
  const now = new Date().toISOString();

  fs.mkdirSync(path.join(outputDir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "databases"), { recursive: true });

  console.log(
    `Syncing ${workspaceConfig.name} (${fullSync ? "full" : "incremental"})...`
  );

  // 1. Discover all items via search
  const allItems = [];
  let cursor = undefined;
  while (true) {
    const resp = await notion.search({
      page_size: 100,
      start_cursor: cursor,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });
    allItems.push(...resp.results);

    // For incremental: if we've passed the lastSync threshold, we can stop
    // (since results are sorted by last_edited desc)
    if (lastSync && resp.results.length > 0) {
      const oldest = resp.results[resp.results.length - 1].last_edited_time;
      if (oldest < lastSync) {
        // Filter out items older than lastSync
        break;
      }
    }

    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }

  // Split into pages and databases
  const databases = allItems.filter((i) => i.object === "database");
  const pages = allItems.filter(
    (i) => i.object === "page" && (!lastSync || i.last_edited_time >= lastSync)
  );

  // Filter pages: skip DB row pages (they get synced with their DB)
  const dbIds = new Set(databases.map((d) => d.id));
  // Also collect all known DB ids from state
  for (const dbId of Object.keys(state.databases)) {
    dbIds.add(dbId);
  }

  const standalonePages = pages.filter((p) => {
    const parentType = p.parent?.type;
    if (parentType === "database_id") return false; // DB row
    return true;
  });

  console.log(
    `Found ${databases.length} databases, ${standalonePages.length} standalone pages to sync`
  );

  // 2. Sync standalone pages
  let pageCount = 0;
  for (const page of standalonePages) {
    const title = getPlainTitle(page);
    const slug = slugify(title) || page.id.slice(0, 8);
    const filename = `${slug}.md`;
    const filepath = path.join(outputDir, "pages", filename);

    // Check if changed
    if (
      state.pages[page.id]?.lastEdited === page.last_edited_time &&
      fs.existsSync(filepath)
    ) {
      continue;
    }

    const body = await pageToMarkdown(n2m, notion, page.id);

    const frontmatter = [
      "---",
      `id: "${page.id}"`,
      `title: ${JSON.stringify(title)}`,
      `url: "https://notion.so/${page.id.replace(/-/g, "")}"`,
      `last_edited: "${page.last_edited_time}"`,
      `synced: "${now}"`,
      "---",
    ].join("\n");

    fs.writeFileSync(filepath, `${frontmatter}\n\n${body}`);
    state.pages[page.id] = {
      lastEdited: page.last_edited_time,
      filename,
      title,
    };
    pageCount++;
    process.stdout.write(`  page: ${title.slice(0, 50)}\r`);
  }
  if (pageCount > 0) console.log(`\n  Synced ${pageCount} pages`);

  // 3. Sync databases
  let dbRowCount = 0;
  for (const db of databases) {
    let dbTitle;
    try {
      dbTitle = getPlainTitle(db) || db.id.slice(0, 8);
    } catch (err) {
      console.error(`\nFailed to get title for DB ${db.id}:`, JSON.stringify(db.title), err.message);
      dbTitle = db.id.slice(0, 8);
    }
    const dbSlug = slugify(dbTitle) || db.id.slice(0, 8);
    const dbDir = path.join(outputDir, "databases", dbSlug);
    fs.mkdirSync(dbDir, { recursive: true });

    // Query rows (incremental if possible)
    const filter = lastSync
      ? {
          timestamp: "last_edited_time",
          last_edited_time: { after: lastSync },
        }
      : undefined;

    const rows = [];
    let rowCursor = undefined;
    while (true) {
      const queryParams = {
        database_id: db.id,
        page_size: 100,
        start_cursor: rowCursor,
      };
      if (filter) queryParams.filter = filter;

      const resp = await notion.databases.query(queryParams);
      rows.push(...resp.results);
      if (!resp.has_more) break;
      rowCursor = resp.next_cursor;
    }

    // Write each row
    for (const row of rows) {
      const rowTitle = getPlainTitle(row);
      const rowSlug = slugify(rowTitle) || row.id.slice(0, 8);
      const rowFilename = `${rowSlug}.md`;
      const rowPath = path.join(dbDir, rowFilename);

      // Properties as frontmatter
      const props = {};
      for (const [key, val] of Object.entries(row.properties)) {
        const formatted = formatProperty(val);
        if (formatted) props[key] = formatted;
      }

      // Get page body
      const body = await pageToMarkdown(n2m, notion, row.id);

      const fm = [
        "---",
        `id: "${row.id}"`,
        `database: ${JSON.stringify(dbTitle)}`,
        `url: "https://notion.so/${row.id.replace(/-/g, "")}"`,
        `last_edited: "${row.last_edited_time}"`,
        `synced: "${now}"`,
      ];
      for (const [k, v] of Object.entries(props)) {
        // Escape YAML values
        fm.push(`${k}: ${JSON.stringify(v)}`);
      }
      fm.push("---");

      fs.writeFileSync(rowPath, `${fm.join("\n")}\n\n${body}`);

      if (!state.databases[db.id]) state.databases[db.id] = { rows: {}, title: dbTitle, slug: dbSlug };
      state.databases[db.id].title = dbTitle;
      state.databases[db.id].slug = dbSlug;
      state.databases[db.id].rows[row.id] = {
        lastEdited: row.last_edited_time,
        filename: rowFilename,
        title: rowTitle,
      };
      dbRowCount++;
      process.stdout.write(`  db/${dbSlug}: ${rowTitle.slice(0, 40)}\r`);
    }

    // Write DB index
    const allRows = state.databases[db.id]?.rows || {};
    const indexLines = [
      `# ${dbTitle}`,
      "",
      `> Database ID: ${db.id}`,
      `> Last synced: ${now}`,
      "",
      "| Title | Status | Last Edited |",
      "|-------|--------|-------------|",
    ];
    for (const [, info] of Object.entries(allRows)) {
      indexLines.push(
        `| [${info.title}](${info.filename}) | — | ${info.lastEdited?.slice(0, 10) || "—"} |`
      );
    }
    fs.writeFileSync(path.join(dbDir, "INDEX.md"), indexLines.join("\n"));
  }
  if (dbRowCount > 0) console.log(`\n  Synced ${dbRowCount} database rows`);

  // 4. Write top-level index
  const indexLines = [
    `# ${workspaceConfig.name}`,
    "",
    `> Last synced: ${now}`,
    "",
    "## Databases",
    "",
  ];
  for (const [dbId, dbState] of Object.entries(state.databases)) {
    const title = dbState.title || dbId;
    const slug = dbState.slug || slugify(title) || dbId.slice(0, 8);
    indexLines.push(`- [${title}](databases/${slug}/INDEX.md)`);
  }
  indexLines.push("", "## Pages", "");
  for (const [, info] of Object.entries(state.pages)) {
    indexLines.push(`- [${info.title}](pages/${info.filename})`);
  }
  fs.writeFileSync(path.join(outputDir, "INDEX.md"), indexLines.join("\n"));

  // 5. Save state
  state.lastSync = now;
  saveState(outputDir, state);

  console.log(`Done. ${pageCount} pages, ${dbRowCount} DB rows synced.`);
  return { pageCount, dbRowCount };
}

// --- Git ---

function gitCommit(outputDir, message) {
  try {
    execSync("git add -A", { cwd: outputDir, stdio: "pipe" });
    const status = execSync("git status --porcelain", {
      cwd: outputDir,
      encoding: "utf-8",
    });
    if (status.trim()) {
      execSync(`git commit -m ${JSON.stringify(message)}`, {
        cwd: outputDir,
        stdio: "pipe",
      });
      console.log(`Git: committed "${message}"`);
      return true;
    } else {
      console.log("Git: no changes to commit");
      return false;
    }
  } catch (err) {
    console.error(`Git error: ${err.message}`);
    return false;
  }
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "sync";

  if (command === "init") {
    const configDir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(configDir, { recursive: true });
    const template = {
      outputDir: path.join(process.env.HOME, "repos/notion-content"),
      gitCommit: true,
      workspaces: [
        {
          name: "Personal",
          apiKeyFile: "~/.config/notion/personal_api_key",
          subdir: "personal",
        },
        {
          name: "St0x",
          apiKeyFile: "~/.config/notion/api_key",
          subdir: "st0x",
        },
      ],
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(template, null, 2));
    console.log(`Config written to ${CONFIG_PATH}`);
    console.log("Edit it, then run: notion-mirror sync");
    return;
  }

  if (command === "sync") {
    const fullSync = args.includes("--full");
    const config = loadConfig();
    const outputDir = config.outputDir.replace("~", process.env.HOME);

    // Ensure output dir exists and is a git repo
    fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(path.join(outputDir, ".git"))) {
      execSync("git init", { cwd: outputDir, stdio: "pipe" });
      fs.writeFileSync(
        path.join(outputDir, ".gitignore"),
        ".notion-mirror-state.json\n"
      );
      console.log(`Initialized git repo at ${outputDir}`);
    }

    let totalPages = 0;
    let totalRows = 0;

    for (const ws of config.workspaces) {
      const wsDir = path.join(outputDir, ws.subdir);
      const apiKeyFile = ws.apiKeyFile?.replace("~", process.env.HOME);
      const { pageCount, dbRowCount } = await syncWorkspace(
        { ...ws, apiKeyFile },
        wsDir,
        fullSync
      );
      totalPages += pageCount;
      totalRows += dbRowCount;
    }

    if (config.gitCommit) {
      const syncType = fullSync ? "full" : "incremental";
      gitCommit(
        outputDir,
        `sync: ${syncType} — ${totalPages} pages, ${totalRows} rows`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
