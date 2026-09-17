// PROTOTYPE (#174): covers a screen rectangle with an opaque window owned by another app (osascript),
// so a browser window underneath is fully occluded without being minimised or losing its tab.
// Usage: osascript -l JavaScript cover.js <left> <top> <width> <height> <seconds>
// Coordinates are top-left based, as the browser windows APIs report them; Cocoa's origin is bottom-left.
ObjC.import("Cocoa");
function run(argv) {
  const [left, top, width, height, seconds] = argv.map(Number);
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const screenH = $.NSScreen.screens.objectAtIndex(0).frame.size.height;
  const rect = $.NSMakeRect(left - 20, screenH - top - height - 20, width + 40, height + 40);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(rect, $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false);
  win.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.15, 0.15, 0.2, 1);
  win.opaque = true;
  win.level = $.NSFloatingWindowLevel;
  win.makeKeyAndOrderFront(null);
  const until = $.NSDate.dateWithTimeIntervalSinceNow(seconds);
  while ($.NSDate.date.compare(until) < 0) {
    $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.2));
  }
  win.close;
  return "covered " + [left, top, width, height].join(",") + " for " + seconds + " s";
}
