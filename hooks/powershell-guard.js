const fs = require('fs');

// Rules are evaluated top-down — first match wins.
// All risky commands prompt the user for confirmation (ask), nothing is hard-blocked.
const RULES = [
  // --- SAFE: always allow ---
  { pattern: /\bpnpm\s+exec\s+tsc\s+--noEmit\b/i, action: "allow", reason: "safe command (pnpm exec tsc --noEmit)" },
  { pattern: /\bpnpm\s+lint\b/i, action: "allow", reason: "safe command (pnpm lint)" },
  { pattern: /\bgit\s+log\b/i, action: "allow", reason: "safe command (git log)" },
  { pattern: /\bgit\s+show\b/i, action: "allow", reason: "safe command (git show)" },
  { pattern: /\bgit\s+status\s+--short\b/i, action: "allow", reason: "safe command (git status --short)" },
  { pattern: /\bgit\s+status\b/i, action: "allow", reason: "safe command (git status)" },

  // --- HIGH RISK: always ask ---

  // Recursive deletes
  { pattern: /\bRemove-Item\b[^#\n]*-Recurse\b/i, action: "ask", reason: "recursive delete (Remove-Item -Recurse)" },
  { pattern: /\b(del|erase)\b[^#\n]*\/[sS]\b/i, action: "ask", reason: "recursive delete (del /S)" },
  { pattern: /\b(rd|rmdir)\b[^#\n]*\/[sS]\b/i, action: "ask", reason: "recursive delete (rd /S)" },

  // Privilege escalation
  { pattern: /\brunas\b/i, action: "ask", reason: "elevated privileges (runas)" },
  { pattern: /\bgsudo\b/i, action: "ask", reason: "elevated privileges (gsudo)" },
  { pattern: /\bStart-Process\b[^#\n]*-Verb\s+RunAs\b/i, action: "ask", reason: "elevated privileges (Start-Process RunAs)" },

  // Remote code execution
  { pattern: /\b(Invoke-WebRequest|iwr|curl|wget|irm|Invoke-RestMethod)\b[^#\n]*\|\s*(Invoke-Expression|iex|cmd|powershell|pwsh)\b/i, action: "ask", reason: "pipe to shell (remote code execution)" },
  { pattern: /\b(iex|Invoke-Expression)\b[^#\n]*\b(Invoke-WebRequest|iwr|Net\.WebClient|DownloadString)\b/i, action: "ask", reason: "remote code execution (IEX + download)" },

  // Disk / partition
  { pattern: /\bdiskpart\b/i, action: "ask", reason: "disk partition management (diskpart)" },
  { pattern: /(?:^\s*|[;&|]\s*)format(?![-\w])\s/im, action: "ask", reason: "disk formatting (format)" },
  { pattern: /\b(Initialize-Disk|Clear-Disk)\b/i, action: "ask", reason: "destructive disk operation" },
  { pattern: /\bRemove-Partition\b/i, action: "ask", reason: "partition deletion" },

  // Boot / OS
  { pattern: /\bbcdedit\b/i, action: "ask", reason: "boot configuration modification (bcdedit)" },
  { pattern: /\breg\s+delete\b/i, action: "ask", reason: "registry deletion (reg delete)" },
  { pattern: /\b(Stop-Computer|Restart-Computer)\b/i, action: "ask", reason: "system power operation" },
  { pattern: /\bshutdown\b[^#\n]*\/[sStrR]\b/i, action: "ask", reason: "system power operation (shutdown)" },

  // Security policy
  { pattern: /\bSet-ExecutionPolicy\b/i, action: "ask", reason: "execution policy change" },
  { pattern: /\bSet-MpPreference\b[^#\n]*DisableRealtimeMonitoring/i, action: "ask", reason: "disabling Windows Defender" },

  // Cloud / infra teardown
  { pattern: /\bterraform\s+destroy\b/i, action: "ask", reason: "infrastructure teardown (terraform destroy)" },
  { pattern: /\bkubectl\s+delete\b/i, action: "ask", reason: "Kubernetes resource deletion" },
  { pattern: /\baws\s+s3\s+rm\b[^#\n]*--recursive/i, action: "ask", reason: "bulk S3 deletion (aws s3 rm --recursive)" },

  // Git destructive
  { pattern: /\bgit\s+reset\b[^#\n]*--hard\b/i, action: "ask", reason: "discard all uncommitted changes (git reset --hard)" },
  { pattern: /\bgit\s+clean\b[^#\n]*-[a-zA-Z]*f/i, action: "ask", reason: "delete untracked files (git clean -f)" },
  { pattern: /\bgit\s+reflog\s+expire\b/i, action: "ask", reason: "expire reflog (removes recovery history)" },
  { pattern: /\bgit\s+gc\b[^#\n]*--prune\b/i, action: "ask", reason: "prune unreachable objects (git gc --prune)" },
  { pattern: /\bgit\s+push\b[^#\n]*(--force|-f)\b/i, action: "ask", reason: "force push (git push --force)" },

  // --- ASK: prompt user before proceeding ---

  // File/folder deletion (non-recursive)
  { pattern: /\b(Remove-Item|ri)\b/i, action: "ask", reason: "file/folder deletion (Remove-Item)" },
  { pattern: /(?:^\s*|[;&|]\s*)(del|erase)\b/im, action: "ask", reason: "file deletion (del/erase)" },
  { pattern: /(?:^\s*|[;&|]\s*)(rd|rmdir)\b/im, action: "ask", reason: "directory removal (rd/rmdir)" },
  { pattern: /\bClear-Content\b/i, action: "ask", reason: "file content erasure (Clear-Content)" },
  { pattern: /\bgit\s+rm\b/i, action: "ask", reason: "git rm (tracked file removal)" },

  // Registry modification (broader than hard-block)
  { pattern: /\breg\s+(add|import)\b/i, action: "ask", reason: "registry modification (reg add/import)" },
  { pattern: /\b(Remove-ItemProperty|Set-ItemProperty|New-ItemProperty)\b[^#\n]*\b(HKLM|HKCU|HKCR|HKU|HKCC|Registry)\b/i, action: "ask", reason: "registry modification via PowerShell" },

  // Services / processes
  { pattern: /\b(Stop-Service|Set-Service)\b/i, action: "ask", reason: "service modification" },
  { pattern: /\b(sc\s+(stop|delete|config))\b/i, action: "ask", reason: "service modification (sc)" },
  { pattern: /\bnet\s+stop\b/i, action: "ask", reason: "service stop (net stop)" },
  { pattern: /\b(Stop-Process|taskkill)\b/i, action: "ask", reason: "process termination" },

  // Force overwrite / permissions
  { pattern: /\b(Move-Item|Copy-Item)\b[^#\n]*-Force\b/i, action: "ask", reason: "forced copy/move (-Force)" },
  { pattern: /\b(move|copy|xcopy)\b[^#\n]*\/[yY]\b/i, action: "ask", reason: "overwrite without prompt (/Y)" },
  { pattern: /\b(icacls|takeown|Set-Acl)\b/i, action: "ask", reason: "permission/ACL modification" },

  // Security / firewall (broader)
  { pattern: /\bnetsh\s+advfirewall\b/i, action: "ask", reason: "firewall rule modification" },
  { pattern: /-ExecutionPolicy\s+Bypass\b/i, action: "ask", reason: "ExecutionPolicy Bypass" },

  // Cloud delete (broader)
  { pattern: /\b(gcloud|az)\b[^#\n]*\bdelete\b/i, action: "ask", reason: "cloud resource deletion" },
];

function respond(decision, reason) {
  const output = { hookSpecificOutput: { permissionDecision: decision } };
  if (reason) output.hookSpecificOutput.permissionDecisionReason = reason;
  console.log(JSON.stringify(output));
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    respond("allow");
    return;
  }

  if (!raw.trim()) { respond("allow"); return; }

  let data;
  try { data = JSON.parse(raw); } catch { respond("allow"); return; }

  const cmd = (data?.tool_input?.CommandLine || data?.tool_input?.command || "").trim();
  if (!cmd) { respond("allow"); return; }

  for (const { pattern, action, reason } of RULES) {
    if (pattern.test(cmd)) {
      respond(action, `[powershell-guard] ${reason}`);
      return;
    }
  }

  respond("allow");
}

main();
