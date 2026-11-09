// Posts one key chord, or one click, into one browser process, at the macOS input level (#1019).
//
// The events go in at the HID event tap, where a keyboard's events enter the window server, so they reach the browser
// through AppKit and its shortcut handling as a key press does. That is the difference from CDP and BiDi keys, which
// go straight into the page and skip the shortcut layer (#418). It is still not a physical press: the owner's check
// set in #1019 is what shows the two agree.
//
// Safety: the target is a process id, brought to the front through Accessibility. Before every single event the
// frontmost process is checked again, and on any mismatch nothing more is posted, except the releases of modifiers
// already put down, so no key is left held.
//
// Bringing a browser forward (measured on macOS 26.2, 2026-11-09): Accessibility's frontmost flag, the raise action
// and `NSRunningApplication.activate` are all refused for an app in the background, and the click fallback only fires
// where the target's strip is uncovered. What works is the browser raising itself: CDP's `/json/activate` for the
// throwaway Chrome; `open -a` for an app with one running copy (Firefox, Orion). Any click by the owner takes focus
// back, and the next press then stops, as it should.
//
// Build: swiftc -O scripts/keyprobe-press.swift -o <somewhere>/keyprobe-press
// Usage:
//   keyprobe-press front                         the frontmost app's bundle id and pid
//   keyprobe-press activate <pid>                bring it to the front, or exit 2
//   keyprobe-press press <pid> <chord> [holdMs]  e.g. opt+k, ctrl+shift+k, cmd+ctrl+k, k, escape
//   keyprobe-press click <pid> <x> <y> [right]   global coordinates, top-left origin
//   keyprobe-press windows <pid>                 that process's on-screen windows: id, bounds, title
import AppKit
import ApplicationServices
import CoreGraphics

func fail(_ message: String, _ code: Int32 = 1) -> Never {
  FileHandle.standardError.write("keyprobe-press: \(message)\n".data(using: .utf8)!)
  exit(code)
}

func frontPid() -> pid_t { NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1 }

func activate(_ pid: pid_t) -> Bool {
  if frontPid() == pid { return true }
  guard let running = NSRunningApplication(processIdentifier: pid) else { fail("no process \(pid)") }
  running.activate(options: [.activateAllWindows])
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
  // Raising lifts the window above others even where activation is refused, which uncovers it for the click below.
  var windows: CFTypeRef?
  if AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windows) == .success, let ws = windows as? [AXUIElement] {
    for w in ws.reversed() { AXUIElementPerformAction(w, kAXRaiseAction as CFString) }
  }
  for _ in 0..<20 {
    if frontPid() == pid { return true }
    usleep(50_000)
  }
  // macOS 14 and later may refuse an activation that no click asked for. A click does it, and it is safe when the
  // topmost window under the point belongs to the target: the empty end of its title bar or tab strip.
  guard let at = titleBarPoint(pid) else { return false }
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(60_000)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: at, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(60_000)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: at, mouseButton: .left)!.post(tap: .cghidEventTap)
  for _ in 0..<20 {
    if frontPid() == pid { return true }
    usleep(50_000)
  }
  return frontPid() == pid
}

/// A point near the right end of the target's largest window's top strip, if nothing else covers it.
func titleBarPoint(_ pid: pid_t) -> CGPoint? {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  let bounds = { (w: [String: Any]) -> CGRect in
    let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
    return CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
  }
  let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? pid_t) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
  guard let main = mine.max(by: { bounds($0).width * bounds($0).height < bounds($1).width * bounds($1).height }) else { return nil }
  let r = bounds(main)
  let at = CGPoint(x: r.maxX - 220, y: r.minY + 16)
  // The window list runs front to back: the first window holding the point is the one a click lands on.
  guard let top = list.first(where: { bounds($0).contains(at) && ($0[kCGWindowAlpha as String] as? Double ?? 1) > 0 }),
        (top[kCGWindowOwnerPID as String] as? pid_t) == pid else { return nil }
  return at
}

let modifierKeys: [(name: String, code: CGKeyCode, flag: CGEventFlags)] = [
  ("ctrl", 59, .maskControl), ("opt", 58, .maskAlternate), ("shift", 56, .maskShift), ("cmd", 55, .maskCommand),
]
let namedKeys: [String: CGKeyCode] = [
  "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14,
  "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
  "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
  "return": 36, "tab": 48, "space": 49, "escape": 53, "left": 123, "right": 124, "down": 125, "up": 126,
]

let source = CGEventSource(stateID: .hidSystemState)

/// Posts one event, unless the target is no longer in front.
func post(_ event: CGEvent, to pid: pid_t) -> Bool {
  guard frontPid() == pid else { return false }
  event.post(tap: .cghidEventTap)
  return true
}

func modifierEvent(_ code: CGKeyCode, flags: CGEventFlags) -> CGEvent {
  let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)!
  e.type = .flagsChanged
  e.flags = flags
  return e
}

func press(_ pid: pid_t, _ chord: String, holdMs: Int) {
  let parts = chord.lowercased().split(separator: "+").map(String.init)
  guard let keyName = parts.last, let key = namedKeys[keyName] else { fail("unknown key in \(chord)") }
  let wanted = Set(parts.dropLast())
  for m in wanted where !modifierKeys.contains(where: { $0.name == m }) { fail("unknown modifier \(m)") }
  let mods = modifierKeys.filter { wanted.contains($0.name) }
  guard activate(pid) else { fail("pid \(pid) would not come to the front (front is \(frontPid()))", 2) }
  usleep(150_000)

  var flags: CGEventFlags = []
  var down: [(code: CGKeyCode, flag: CGEventFlags)] = []
  var ok = true
  defer {
    // Whatever happened, the modifiers that went down come back up, into whatever is in front now.
    for m in down.reversed() {
      flags.remove(m.flag)
      modifierEvent(m.code, flags: flags).post(tap: .cghidEventTap)
      usleep(30_000)
    }
    if !ok { fail("the front app changed mid-chord; stopped", 3) }
  }
  for m in mods {
    flags.insert(m.flag)
    guard post(modifierEvent(m.code, flags: flags), to: pid) else { ok = false; return }
    down.append((m.code, m.flag))
    usleep(40_000)
  }
  usleep(60_000)
  let keyDown = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true)!
  keyDown.flags = flags
  guard post(keyDown, to: pid) else { ok = false; return }
  usleep(useconds_t(holdMs * 1000))
  let keyUp = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false)!
  keyUp.flags = flags
  // The key-up goes even if the front changed, so the letter is never left held.
  keyUp.post(tap: .cghidEventTap)
  usleep(40_000)
  print("pressed \(chord) into \(pid)")
}

func click(_ pid: pid_t, _ x: Double, _ y: Double, right: Bool) {
  guard activate(pid) else { fail("pid \(pid) would not come to the front (front is \(frontPid()))", 2) }
  usleep(150_000)
  let at = CGPoint(x: x, y: y)
  let (downType, upType, button): (CGEventType, CGEventType, CGMouseButton) =
    right ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
  let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left)!
  guard post(move, to: pid) else { fail("the front app changed; stopped", 3) }
  usleep(80_000)
  guard post(CGEvent(mouseEventSource: source, mouseType: downType, mouseCursorPosition: at, mouseButton: button)!, to: pid)
  else { fail("the front app changed; stopped", 3) }
  usleep(70_000)
  CGEvent(mouseEventSource: source, mouseType: upType, mouseCursorPosition: at, mouseButton: button)!.post(tap: .cghidEventTap)
  print("clicked \(right ? "right " : "")\(Int(x)),\(Int(y)) in \(pid)")
}

func windows(_ pid: pid_t) {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  for w in list where (w[kCGWindowOwnerPID as String] as? pid_t) == pid {
    let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    print("window \(w[kCGWindowNumber as String] ?? "?") layer \(layer) x \(Int(b["X"] ?? 0)) y \(Int(b["Y"] ?? 0)) w \(Int(b["Width"] ?? 0)) h \(Int(b["Height"] ?? 0)) \"\(w[kCGWindowName as String] ?? "")\"")
  }
}

let args = CommandLine.arguments.dropFirst().map { $0 }
guard AXIsProcessTrusted() else { fail("this process has no Accessibility permission") }
switch args.first {
case "front":
  let a = NSWorkspace.shared.frontmostApplication
  print("\(a?.bundleIdentifier ?? "?") \(a?.processIdentifier ?? -1)")
case "activate":
  guard args.count == 2, let pid = pid_t(args[1]) else { fail("activate <pid>") }
  guard activate(pid) else { fail("pid \(pid) would not come to the front (front is \(frontPid()))", 2) }
  print("front: \(pid)")
case "press":
  guard args.count >= 3, let pid = pid_t(args[1]) else { fail("press <pid> <chord> [holdMs]") }
  press(pid, args[2], holdMs: args.count > 3 ? Int(args[3]) ?? 90 : 90)
case "click":
  guard args.count >= 4, let pid = pid_t(args[1]), let x = Double(args[2]), let y = Double(args[3]) else { fail("click <pid> <x> <y> [right]") }
  click(pid, x, y, right: args.count > 4 && args[4] == "right")
case "windows":
  guard args.count == 2, let pid = pid_t(args[1]) else { fail("windows <pid>") }
  windows(pid)
default:
  fail("front | activate <pid> | press <pid> <chord> [holdMs] | click <pid> <x> <y> [right] | windows <pid>")
}
