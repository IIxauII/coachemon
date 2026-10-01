#!/usr/bin/env bash
# #518: runs bench-jsc.js on Orion's own JavaScriptCore (three times), on the system's, and on Node, into results/.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results
ORION=/Applications/Orion.app/Contents/Frameworks
plist() { defaults read "$1" "$2"; }
{
  echo "# $(date -u +%FT%TZ) $(sysctl -n machdep.cpu.brand_string), macOS $(sw_vers -productVersion)," \
    "Orion $(plist /Applications/Orion.app/Contents/Info.plist CFBundleShortVersionString)," \
    "Orion's JavaScriptCore.framework $(plist "$ORION/JavaScriptCore.framework/Versions/A/Resources/Info.plist" CFBundleVersion)"
  echo "# DYLD_FRAMEWORK_PATH=$ORION $ORION/JavaScriptCore.framework/Versions/A/Helpers/jsc -m bench-jsc.js"
  for _ in 1 2 3; do
    DYLD_FRAMEWORK_PATH="$ORION" "$ORION/JavaScriptCore.framework/Versions/A/Helpers/jsc" -m bench-jsc.js
  done
} > results/synthetic-orion-jsc.txt 2>&1
{
  echo "# $(date -u +%FT%TZ) system JavaScriptCore.framework" \
    "$(plist /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Resources/Info.plist CFBundleVersion)"
  /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m bench-jsc.js
  echo "# node $(node --version)"
  node bench-jsc.js
} > results/synthetic-system-jsc-and-node.txt 2>&1
cat results/synthetic-orion-jsc.txt results/synthetic-system-jsc-and-node.txt
