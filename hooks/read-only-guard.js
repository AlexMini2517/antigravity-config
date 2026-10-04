/**
 * read-only-guard — PreToolUse hook for Antigravity IDE.
 *
 * Blocks file-mutating tools (write_to_file, replace_file_content,
 * multi_replace_file_content, run_command) when the sentinel file exists.
 *
 * Activation: create  ~/.gemini/config/.read-only
 * Deactivation: delete ~/.gemini/config/.read-only
 *
 * Quick toggle from PowerShell:
 *   Enable:   New-Item "$env:USERPROFILE\.gemini\config\.read-only" -Force
 *   Disable:  Remove-Item "$env:USERPROFILE\.gemini\config\.read-only" -ErrorAction SilentlyContinue
 */

const fs = require("fs");
const path = require("path");

const SENTINEL = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".gemini",
  "config",
  ".read-only"
);

function respond(decision, reason) {
  const output = { decision };
  if (reason) output.reason = reason;
  console.log(JSON.stringify(output));
}

function main() {
  // If the sentinel file doesn't exist, read-only mode is off → allow everything
  if (!fs.existsSync(SENTINEL)) {
    respond("allow");
    return;
  }

  // Read-only mode is active → deny the tool call
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    respond("deny", "[read-only] Read-only mode is active. Cannot determine tool — blocking by default.");
    return;
  }

  let data;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    respond("deny", "[read-only] Read-only mode is active.");
    return;
  }

  const toolName = data?.toolCall?.name || "";

  respond(
    "deny",
    `[read-only] Read-only mode is active (sentinel: ${SENTINEL}). ` +
    `Tool '${toolName}' is blocked. ` +
    "Only read/inspect operations are allowed. " +
    "Describe changes as code blocks for the user to apply manually. " +
    "To disable read-only mode, delete the sentinel file."
  );
}

main();
