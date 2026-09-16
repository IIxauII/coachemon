#!/bin/sh
# PROTOTYPE (#150): builds dist/cws and dist/amo folders plus .zip / .xpi from one source.
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
for b in cws amo; do
  mkdir -p "dist/$b" && cp src/*.js "dist/$b/" && cp "manifest.$b.json" "dist/$b/manifest.json"
  (cd "dist/$b" && zip -qr "../probe150-$b.zip" .)
done
cp dist/probe150-amo.zip dist/probe150-amo.xpi
ls -1 dist
