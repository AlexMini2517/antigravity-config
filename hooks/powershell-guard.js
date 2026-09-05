const fs = require('fs');

// Rules are evaluated top-down — first match wins.
// Any command matching a rule will prompt the user for confirmation (ask).
// Any command that doesn't match any rule is automatically allowed without prompt.
const RULES = [
  // 1. Recursive Deletions (evaluated before general deletions for accurate reason)
  {
    pattern: /\bRemove-Item\b[^#\n]*-Recurse\b|\b(del|erase|rd|rmdir)\b[^#\n]*\/[sS]\b/i,
    action: "ask",
    reason: "recursive delete (Remove-Item -Recurse, del /S, rd /S)"
  },

  // 2. File & Directory Deletions (general / non-recursive)
  {
    pattern: /\b(Remove-Item|ri|Clear-Content)\b|(?:^\s*|[;&|]\s*)(del|erase|rd|rmdir)\b/im,
    action: "ask",
    reason: "file/directory deletion (Remove-Item, del, rd, Clear-Content)"
  },

  // 3. Privilege Escalation
  {
    pattern: /\b(runas|gsudo)\b|\bStart-Process\b[^#\n]*-Verb\s+RunAs\b/i,
    action: "ask",
    reason: "elevated privileges (runas, gsudo, Start-Process -Verb RunAs)"
  },

  // 4. Remote Code Execution & Pipeline to Shell
  {
    pattern: /\b(Invoke-WebRequest|iwr|curl|wget|irm|Invoke-RestMethod)\b[^#\n]*\|\s*(Invoke-Expression|iex|cmd|powershell|pwsh)\b|\b(iex|Invoke-Expression)\b[^#\n]*\b(Invoke-WebRequest|iwr|Net\.WebClient|DownloadString)\b/i,
    action: "ask",
    reason: "remote code execution (download & execute or pipe to shell)"
  },

  // 5. Disk & Partition Management
  {
    pattern: /\b(diskpart|Initialize-Disk|Clear-Disk|Remove-Partition)\b|(?:^\s*|[;&|]\s*)format(?![-\w])\s/im,
    action: "ask",
    reason: "destructive disk/partition operation (diskpart, format, partition management)"
  },

  // 6. OS Power, Reboot & Bootloader
  {
    pattern: /\b(bcdedit|Stop-Computer|Restart-Computer)\b|\bshutdown\b[^#\n]*\/[sStrR]\b/i,
    action: "ask",
    reason: "system reboot/shutdown or boot config modification"
  },

  // 7. Security Policies & Firewall
  {
    pattern: /\b(Set-ExecutionPolicy|netsh\s+advfirewall)\b|-ExecutionPolicy\s+Bypass\b|\bSet-MpPreference\b[^#\n]*DisableRealtimeMonitoring/i,
    action: "ask",
    reason: "security policy, Defender, or firewall modification"
  },

  // 8. Destructive Git Operations
  {
    pattern: /\bgit\s+(reset\b[^#\n]*--hard|clean\b[^#\n]*-[a-zA-Z]*f|reflog\s+expire|gc\b[^#\n]*--prune|push\b[^#\n]*(--force|-f)|rm\b)/i,
    action: "ask",
    reason: "destructive git operation (git reset --hard, clean -f, force push, git rm)"
  },

  // 9. Windows Registry
  {
    pattern: /\breg\s+(delete|add|import)\b|\b(Remove|Set|New)-ItemProperty\b[^#\n]*\b(HKLM|HKCU|HKCR|HKU|HKCC|Registry)\b/i,
    action: "ask",
    reason: "registry modification (reg, *-ItemProperty)"
  },

  // 10. Services & Process Termination
  {
    pattern: /\b(Stop-Service|Set-Service|Stop-Process|taskkill)\b|\b(sc\s+(stop|delete|config)|net\s+stop)\b/i,
    action: "ask",
    reason: "service or process termination (Stop-Process, taskkill, sc, net stop)"
  },

  // 11. Overwrite & ACL / Permissions
  {
    pattern: /\b(Move-Item|Copy-Item)\b[^#\n]*-Force\b|\b(move|copy|xcopy)\b[^#\n]*\/[yY]\b|\b(icacls|takeown|Set-Acl)\b/i,
    action: "ask",
    reason: "forced file overwrite or permission/ACL modification"
  },

  // 12. Cloud & Infrastructure Teardown
  {
    pattern: /\b(terraform\s+destroy|kubectl\s+delete)\b|\baws\s+s3\s+rm\b[^#\n]*--recursive|\b(gcloud|az)\b[^#\n]*\bdelete\b/i,
    action: "ask",
    reason: "cloud/infrastructure resource deletion (terraform, kubectl, aws, az, gcloud)"
  }
];

function respond(decision, reason) {
  const output = { decision };
  if (reason) output.reason = reason;
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

  const cmd = (data?.toolCall?.args?.CommandLine || data?.tool_input?.CommandLine || data?.tool_input?.command || "").trim();
  if (!cmd) { respond("allow"); return; }

  for (const { pattern, action = "ask", reason } of RULES) {
    if (pattern.test(cmd)) {
      respond(action, `[powershell-guard] ${reason}`);
      return;
    }
  }

  respond("allow");
}

main();