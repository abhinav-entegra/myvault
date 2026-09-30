"use strict";

const { spawn } = require("child_process");

/**
 * Activates the top-level window under (x, y) (physical pixels) and, only if keyboard focus is in a
 * text field and the page has a visible password field, overwrites both with the username/password.
 * Nothing is typed otherwise, so stray keystrokes can never trigger browser/site shortcuts.
 * Credentials arrive as JSON on stdin, never argv.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MvNative {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@

function Get-FocusedField {
  for ($i = 0; $i -lt 8; $i++) {
    try {
      $f = [System.Windows.Automation.AutomationElement]::FocusedElement
      if ($f -and $f.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit) { return $f }
    } catch {}
    Start-Sleep -Milliseconds 80
  }
  return $null
}

function Find-PasswordField($from) {
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $scope = $from
  for ($i = 0; $i -lt 40 -and $scope; $i++) {
    if ($scope.Current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { break }
    $scope = $walker.GetParent($scope)
  }
  if (-not $scope) { return $null }
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::IsPasswordProperty, $true)
  foreach ($el in $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
    try { if (-not $el.Current.IsOffscreen -and $el.Current.IsEnabled) { return $el } } catch {}
  }
  return $null
}

# Empty password inputs are not always reported as IsPassword by Chromium, so after Tab any
# text field other than the ID box counts; links/buttons never do.
function Wait-NextTextField($previous) {
  $prevId = ($previous.GetRuntimeId() -join '.')
  $last = $null
  for ($i = 0; $i -lt 15; $i++) {
    try {
      $f = [System.Windows.Automation.AutomationElement]::FocusedElement
      $last = $f
      if ($f -and ($f.GetRuntimeId() -join '.') -ne $prevId -and
          $f.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit) { return $f }
    } catch {}
    Start-Sleep -Milliseconds 70
  }
  if ($last) {
    try {
      [Console]::Error.WriteLine("focused after Tab: type=$($last.Current.ControlType.ProgrammaticName) name='$($last.Current.Name)' id='$($last.Current.AutomationId)' isPassword=$($last.Current.IsPassword)")
    } catch {}
  }
  return $null
}

$cred = [Console]::In.ReadToEnd() | ConvertFrom-Json
function Escape-Keys([string]$s) { return [regex]::Replace($s, '[+^%~(){}\\[\\]]', '{$0}') }
$p = New-Object MvNative+POINT
$p.X = [int]$env:MV_X
$p.Y = [int]$env:MV_Y
$h = [MvNative]::GetAncestor([MvNative]::WindowFromPoint($p), 2)
if ($h -eq [IntPtr]::Zero) { exit 2 }

$fg = [MvNative]::GetForegroundWindow()
if ($fg -ne $h) {
  $fgThread = [MvNative]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
  $me = [MvNative]::GetCurrentThreadId()
  [MvNative]::AttachThreadInput($me, $fgThread, $true) | Out-Null
  [MvNative]::SetForegroundWindow($h) | Out-Null
  [MvNative]::BringWindowToTop($h) | Out-Null
  [MvNative]::AttachThreadInput($me, $fgThread, $false) | Out-Null
  Start-Sleep -Milliseconds 150
}
if ([MvNative]::GetForegroundWindow() -ne $h) { exit 3 }

$field = Get-FocusedField
if (-not $field) { exit 4 }
if ($field.Current.IsPassword) { exit 5 }

# Replace whatever was in the ID box (old text + the dropped username) with just the username.
[System.Windows.Forms.SendKeys]::SendWait('^a' + (Escape-Keys $cred.username))
Start-Sleep -Milliseconds 60

$pwField = Find-PasswordField $field
if ($pwField) {
  try { $pwField.SetFocus() } catch { $pwField = $null }
  Start-Sleep -Milliseconds 80
}
if (-not $pwField) {
  [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
  $pwField = Wait-NextTextField $field
  if (-not $pwField) { exit 6 }
}

[System.Windows.Forms.SendKeys]::SendWait('^a' + (Escape-Keys $cred.password))
`;

const EXIT_REASONS = {
  2: "no-window",
  3: "could-not-focus-window",
  4: "not-dropped-on-field",
  5: "dropped-on-password-field",
  6: "next-field-not-password",
};

function typeLoginIntoWindowAt(point, username, password) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, reason: "unsupported-platform" });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
        {
          windowsHide: true,
          env: { ...process.env, MV_X: String(Math.round(point.x)), MV_Y: String(Math.round(point.y)) },
        }
      );
    } catch (err) {
      resolve({ ok: false, reason: String(err?.message || err) });
      return;
    }
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => resolve({ ok: false, reason: String(err?.message || err) }));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      // eslint-disable-next-line no-console
      if (stderr.trim()) console.warn(`[native-autofill] exit ${code}: ${stderr.trim()}`);
      resolve({ ok: false, reason: EXIT_REASONS[code] || stderr.trim() || `exit ${code}` });
    });
    child.stdin.end(JSON.stringify({ username: String(username), password: String(password) }));
  });
}

module.exports = { typeLoginIntoWindowAt };
