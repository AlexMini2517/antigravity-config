# antigravity-config

My personal [Google Antigravity](https://github.com/google-gemini/gemini-cli) configuration for Windows.

## 🛡️ Hooks

### 1. PowerShell Guard (`PreToolUse`)
Intercepts every `run_command` call and checks it against a list of risky patterns before execution.
- **Safe commands** → executed directly, no prompt
- **Risky commands** → asks for user confirmation before proceeding
- Nothing is ever hard-blocked — you always have the final say

### 2. Read-Only Guard (`PreToolUse`)
Enforces read-only mode by blocking mutating tools (`write_to_file`, `replace_file_content`, `multi_replace_file_content`, `run_command`) when the `.read-only` sentinel file is present (`~/.gemini/config/.read-only`).

### 3. Markdown Log (`PostInvocation`)
Automatically mirrors the conversation to an Obsidian-ready Markdown note in real time after every assistant turn.
- Strips system metadata and tags
- Generates YAML frontmatter, tags (`ai/antigravity`, `chat-log`, `second-brain`), and callouts
- Maintains a single stable note per conversation

## 📁 Files

| File | Description |
|---|---|
| `hooks.json` | Hook configuration — registers `powershell-guard`, `read-only-guard`, and `md-log` |
| `hooks/powershell-guard.js` | Pattern-matched safety rules for PowerShell commands |
| `hooks/read-only-guard.js` | PreToolUse guard script enforcing read-only restrictions |
| `hooks/md-log.js` | PostInvocation hook mirroring conversations to Obsidian Markdown |
| `md-log.example.json` | Template configuration for `md-log` output directory |
| `README.md` | This file |

## Setup

Copy these files into your Antigravity config directory:

```powershell
# Windows
$configDir = "$env:USERPROFILE\.gemini\config"
Copy-Item hooks.json "$configDir\hooks.json"
Copy-Item -Recurse hooks "$configDir\hooks"
Copy-Item md-log.example.json "$configDir\md-log.json"
```
