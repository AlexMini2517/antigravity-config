# antigravity-config

My personal [Google Antigravity](https://github.com/google-gemini/gemini-cli) configuration for Windows.

## 🛡️ PowerShell Guard Hook

A `BeforeTool` hook that intercepts every `run_command` call and checks it against a list of risky patterns before execution.

- **Safe commands** → executed directly, no prompt
- **Risky commands** → asks for user confirmation before proceeding
- Nothing is ever hard-blocked — you always have the final say

**Categories covered:** recursive deletes, privilege escalation, remote code execution, disk/partition operations, registry modifications, service/process management, security policy changes, cloud infrastructure teardown, destructive git operations, and more.

## 📁 Files

| File | Description |
|---|---|
| `hooks.json` | Hook configuration — registers the guard as a `BeforeTool` hook on `run_command` |
| `hooks/powershell-guard.js` | The guard script (~95 lines) — pattern-matched rules with `ask` decisions |
| `README.md` | This file |

## Setup

Copy these files into your Antigravity config directory:

```powershell
# Windows
$configDir = "$env:USERPROFILE\.gemini\config"
Copy-Item hooks.json "$configDir\hooks.json"
Copy-Item -Recurse hooks "$configDir\hooks"
```

The hook is automatically picked up by Antigravity on next launch.
