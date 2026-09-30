const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const VERSION_FIELD = /"version":\s*"[^"]*"/;

export const isSemver = (version: string): boolean => SEMVER.test(version);

/** The version a release script was asked for, or its usage line and a non-zero exit. */
export function versionArg(script: string): string {
  const version = process.argv[2];
  if (!version || !isSemver(version)) {
    console.error(`usage: node ${script} <semver>`);
    process.exit(1);
  }
  return version;
}

/** A JSON file with its version replaced in place, so the file keeps its hand formatting. */
export function stampVersion(text: string, version: string): string {
  if (!VERSION_FIELD.test(text)) throw new Error(`no "version" field to stamp`);
  return text.replace(VERSION_FIELD, `"version": "${version}"`);
}
