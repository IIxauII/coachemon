#!/bin/sh
# Runs once, as root, with network, from /rig/inputs, which holds package.json and package-lock.json and nothing else.
# Everything it leaves is on the read-only root: `prepare` copies node_modules out of the npm cache it fills.
set -eu

# The release CI's `node-version: 24` resolves to; the digest is nodejs.org's SHASUMS256.txt line for this archive.
NODE_VERSION=24.21.0
NODE_SHA256=6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2

# rig.toml's `npm_config_cache` names the same directory.
NPM_CACHE=/opt/rig/npm-cache

apt-get update
apt-get install -y --no-install-recommends curl ca-certificates xz-utils
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz" -o /tmp/node.tar.xz
echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c -
tar -C /usr/local --strip-components=1 -xJf /tmp/node.tar.xz
rm -f /tmp/node.tar.xz /usr/local/CHANGELOG.md /usr/local/LICENSE /usr/local/README.md
node --version
npm --version

# `npm ci` is the one npm command that fills the cache with exactly the lockfile's tarballs.
npm ci --ignore-scripts --no-audit --no-fund --cache "${NPM_CACHE}"
rm -rf node_modules "${NPM_CACHE}/_logs" "${NPM_CACHE}/_update-notifier-last-checked"
chmod -R a+rX /opt/rig

apt-get purge -y --auto-remove curl xz-utils
rm -rf /var/lib/apt/lists/*
