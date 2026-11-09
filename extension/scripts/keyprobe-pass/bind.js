// #1019: binds the Chrome-flavoured probe's hand-bound chords, from a chrome://extensions page over CDP:
//   node scripts/keyprobe-cdp.ts 9557 open chrome://extensions/shortcuts
//   node scripts/keyprobe-cdp.ts 9557 js chrome://extensions/shortcuts "$(cat scripts/keyprobe-pass/bind.js)"
// It is the call the shortcuts page's recorder makes. In this API `Ctrl` is the Control key on macOS; the manifest's
// `MacCtrl` spelling is accepted silently and leaves the binding empty (measured on Chrome 156, 2026-11-09).
(async () => {
  const id = "bfdlnegplhjnnnomakhffjbonpkhbcij";
  const want = [
    ["probe-ctrl-shift-k", "Ctrl+Shift+K"],
    ["probe-opt-shift-k", "Alt+Shift+K"],
    ["probe-cmd-ctrl-k", "Command+Ctrl+K"],
    ["probe-opt-j", "Alt+J"],
    ["probe-ctrl-j", "Ctrl+J"],
    ["probe-opt-u", "Alt+U"],
    ["probe-global", "Command+Shift+1"],
    ["_execute_action", "Command+Shift+U"],
  ];
  const out = [];
  for (const [commandName, keybinding] of want) {
    try {
      await chrome.developerPrivate.updateExtensionCommand({ extensionId: id, commandName, keybinding });
      out.push(`${commandName} ${keybinding}: ok`);
    } catch (e) {
      out.push(`${commandName} ${keybinding}: ${String((e && e.message) || e)}`);
    }
  }
  await chrome.developerPrivate.updateExtensionCommand({ extensionId: id, commandName: "probe-global", scope: "GLOBAL" });
  await chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, pinnedToToolbar: true });
  const info = await chrome.developerPrivate.getExtensionInfo(id);
  for (const c of info.commands) out.push(`now ${c.name}: "${c.keybinding}" scope ${c.scope} active ${c.isActive}`);
  return out.join("\n");
})()
