/**
 * md-log — PostInvocation hook for Antigravity IDE.
 *
 * Reads the conversation transcript and mirrors it to an Obsidian-ready
 * Markdown file in your Obsidian vault.
 *
 * Output: <outputDir>/YYYY-MM-DD_HHMM_slug.md
 * Features:
 * - Extracts clean user requests (stripping <USER_REQUEST> and <ADDITIONAL_METADATA>)
 * - Extracts assistant responses
 * - Obsidian YAML frontmatter + Metadati Chat callout
 * - Stable file naming per conversation (reuses file on subsequent turns)
 */

const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".gemini",
  "config",
  "md-log.json"
);

const DEFAULT_OUTPUT_DIR = "D:\\Users\\Alex\\Documents\\MEGA\\2-learning\\coding\\markdown\\llm-logs";

function getOutputDir() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (typeof data.outputDir === "string" && data.outputDir.trim().length > 0) {
        return data.outputDir.trim();
      }
    }
  } catch { }
  return DEFAULT_OUTPUT_DIR;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatFileDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "_")
    .slice(0, 45);
}

function cleanUserContent(raw) {
  if (!raw) return "";
  const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  let clean = match ? match[1].trim() : raw.trim();
  clean = clean.replace(/<skill\b[^>]*>[\s\S]*?<\/skill>/gi, "").trim();
  return clean;
}

function parseTranscript(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return [];

  const turns = [];
  const lines = fs.readFileSync(transcriptPath, "utf-8").split("\n").filter(Boolean);

  let currentTurn = null;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const time = entry.created_at ? new Date(entry.created_at) : new Date();
    const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}`;

    if (entry.type === "USER_INPUT" && entry.content) {
      const text = cleanUserContent(entry.content);
      if (text) {
        currentTurn = {
          userTime: timeStr,
          userText: text,
          assistantTime: null,
          assistantParts: [],
          toolCallsCount: 0
        };
        turns.push(currentTurn);
      }
    } else if (currentTurn) {
      if (entry.tool_calls && Array.isArray(entry.tool_calls)) {
        currentTurn.toolCallsCount += entry.tool_calls.length;
      }
      if (entry.type === "PLANNER_RESPONSE" && entry.content) {
        const text = entry.content.trim();
        if (text) {
          currentTurn.assistantTime = timeStr;
          currentTurn.assistantParts.push(text);
        }
      }
    }
  }

  return turns;
}

function findExistingLogFile(outputDir, conversationId) {
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir);
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    try {
      const full = path.join(outputDir, f);
      const head = fs.readFileSync(full, "utf-8").slice(0, 500);
      if (head.includes(`conversation_id: "${conversationId}"`)) {
        return full;
      }
    } catch { }
  }
  return null;
}

function generateMarkdown(turns, conversationId) {
  const now = new Date();
  const firstTurn = turns[0];
  const firstLine = firstTurn
    ? firstTurn.userText.split("\n")[0].replace(/^[/#@]\S+\s*/g, "").trim()
    : "Sessione Antigravity";
  const title = (firstLine.length > 3 ? firstLine.slice(0, 65) : "Sessione Antigravity").replace(/"/g, '\\"');

  const lines = [
    "---",
    `title: "${title}"`,
    `date: ${formatDate(now)}`,
    `conversation_id: "${conversationId}"`,
    `turns: ${turns.length}`,
    "tags:",
    "  - ai/antigravity",
    "  - chat-log",
    "  - second-brain",
    "---",
    "",
    `# ${title}`,
    "",
    "> [!info] Metadati Chat",
    `> **Data**: ${formatDate(now)}  `,
    `> **ID Conversazione**: \`${conversationId}\`  `,
    `> **Turni di conversazione**: ${turns.length}`,
    "",
  ];

  for (const turn of turns) {
    lines.push("---", "");
    lines.push(`### 👤 Utente (${turn.userTime || "00:00"})`, "");
    lines.push(turn.userText, "");

    if (turn.assistantParts.length > 0) {
      lines.push(`### 🤖 Assistant (${turn.assistantTime || turn.userTime || "00:00"})`, "");
      if (turn.toolCallsCount > 0) {
        lines.push(`> [!abstract]- 🛠️ Azioni eseguite (${turn.toolCallsCount})`, "");
      }
      lines.push(turn.assistantParts.join("\n\n"), "");
    }
  }

  return { title, markdown: lines.join("\n") };
}

function main() {
  const outputDir = getOutputDir();
  if (!outputDir) {
    console.log(JSON.stringify({}));
    return;
  }

  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  if (!raw.trim()) {
    console.log(JSON.stringify({}));
    return;
  }

  let data;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  const transcriptPath = data?.transcriptPath;
  const conversationId = data?.conversationId;

  if (!transcriptPath || !conversationId) {
    console.log(JSON.stringify({}));
    return;
  }

  const dir = path.dirname(transcriptPath);
  const fullPath = path.join(dir, "transcript_full.jsonl");
  const actualPath = fs.existsSync(fullPath) ? fullPath : transcriptPath;

  const turns = parseTranscript(actualPath);
  if (turns.length === 0) {
    console.log(JSON.stringify({}));
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const { title, markdown } = generateMarkdown(turns, conversationId);

  let targetFile = findExistingLogFile(outputDir, conversationId);
  if (!targetFile) {
    const now = new Date();
    const slug = slugify(title);
    const filename = `${formatFileDate(now)}_${slug || conversationId.slice(0, 8)}.md`;
    targetFile = path.join(outputDir, filename);
  }

  fs.writeFileSync(targetFile, markdown, "utf-8");
  console.log(JSON.stringify({}));
}

main();
