/** Carries out `safariSteps` on the dev's Mac (extension-distribution.md §14.6), set up once by `docs/runbooks/safari-release.md`. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptedSubmissionId,
  developerIdIdentities,
  exportOptions,
  extensionTag,
  packagedVersion,
  pickIdentity,
  repoFromRemote,
  safariPaths,
  safariSteps,
  teamIdFrom,
} from "./safari.ts";
import { releaseVersion, safariAppZipName } from "./artifacts.ts";
import { versionArg } from "./version.ts";

const version = releaseVersion(versionArg("scripts/release/safari-release.ts"));
const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const dryRun = process.argv.includes("--dry-run");
const keep = process.argv.includes("--keep");
// A stored `notarytool` profile, never a password on the command line, where `ps` and the shell history would see it.
const profile = flag("keychain-profile") ?? process.env.COACHEMON_NOTARY_PROFILE ?? "coachemon";

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** A warning in a dry run and a refusal otherwise: a dry run has to work before the membership exists. */
const missing = (message: string): void => {
  if (!dryRun) die(message);
  console.warn(`! ${message}`);
};

const capture = (command: string, args: string[]): string =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

if (process.platform !== "darwin") missing(`the Safari release runs on macOS only (this is ${process.platform})`);
for (const tool of ["xcrun", "xcodebuild", "ditto", "spctl", "gh", "security"]) {
  try {
    capture("/usr/bin/which", [tool]);
  } catch {
    missing(`${tool} is not on PATH; see docs/runbooks/safari-release.md`);
  }
}

/** A dry run's identity when the keychain holds none, shaped so `teamIdFrom` reads it. */
const PLACEHOLDER = "Developer ID Application: <not enrolled yet> (TEAMID1234)";

const identity = ((): string => {
  // Asked of the converter, not `xcode-select -p`: the Command Line Tools answer that too, and ship no converter.
  try {
    capture("xcrun", ["--find", "safari-web-extension-converter"]);
  } catch {
    missing("xcrun finds no safari-web-extension-converter; install Xcode, then `sudo xcode-select -s /Applications/Xcode.app`");
  }
  try {
    const listing = capture("security", ["find-identity", "-v", "-p", "codesigning"]);
    return pickIdentity(developerIdIdentities(listing), flag("identity"));
  } catch (error) {
    missing((error as Error).message);
    return PLACEHOLDER;
  }
})();
const teamId = teamIdFrom(identity);

/**
 * Fresh per run, so a rerun never packages leftovers. A `--work` a human typed must be empty and is never emptied or
 * removed, and a dry run names a directory without creating one.
 */
function scratchDir(): string {
  const asked = flag("work");
  if (dryRun) return asked ?? join(tmpdir(), `coachemon-safari-${version}`);
  if (!asked) return mkdtempSync(join(tmpdir(), `coachemon-safari-${version}-`));
  mkdirSync(asked, { recursive: true });
  if (readdirSync(asked).length > 0) die(`${asked} is not empty; the build would package whatever is already in it`);
  return asked;
}

const repo = ((): string => {
  const asked = flag("repo");
  if (asked) return asked;
  try {
    return repoFromRemote(capture("git", ["-C", REPO_ROOT, "remote", "get-url", "origin"]));
  } catch (error) {
    missing(`cannot read this checkout's origin remote (${(error as Error).message}); pass --repo owner/name`);
    return "<owner>/<name>";
  }
})();

const work = scratchDir();
const plan = { version, work, identity, profile, repo };
const paths = safariPaths(plan);
const steps = safariSteps(plan);
const removable = !keep && !dryRun && !flag("work");

console.log(`${extensionTag(version)} → ${paths.asset}`);
console.log(`  identity  ${identity}`);
console.log(`  team      ${teamId}`);
console.log(`  notarytool profile  ${profile}`);
if (!dryRun) console.log(`  scratch   ${work}${removable ? " (removed when this finishes)" : ""}`);

if (!dryRun) writeFileSync(paths.exportOptions, exportOptions(teamId));

/**
 * `gh release download` leaves the directory as it was when it matches nothing, so a rerun after a botched download
 * would wrap the previous release's extension in an app named for this one.
 */
function checkDownload(): void {
  const manifest = join(paths.unpacked, "manifest.json");
  if (!existsSync(manifest)) die(`${paths.unpacked} holds no manifest.json; the download was not the store build`);
  const found = packagedVersion(readFileSync(manifest, "utf8"));
  if (found !== version) die(`the downloaded extension is ${found}, not ${version}; ${extensionTag(version)} is wrong`);
  console.log(`  manifest  ${found} ✓`);
}

function checkNotarization(output: string): void {
  try {
    console.log(`  submission  ${acceptedSubmissionId(output, profile)} accepted ✓`);
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    die(`the scratch directory is kept at ${work}`);
  }
}

const quote = (arg: string) => (/^[\w./:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`);

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.title}`);
  console.log(`  ${[step.command, ...step.args].map(quote).join(" ")}`);
  if (dryRun) continue;
  const reads = step.id === "notarize";
  let output = "";
  try {
    if (reads) {
      output = execFileSync(step.command, step.args, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    } else {
      execFileSync(step.command, step.args, { cwd: work, stdio: "inherit" });
    }
  } catch (error) {
    console.error(`\n${step.title.toLowerCase()} failed: ${(error as Error).message}`);
    // A read step's output went down the pipe, so it is printed here or nowhere, and for a notarization it holds the
    // submission id.
    const piped = (error as { stdout?: string }).stdout;
    if (piped) console.error(piped.trim());
    die(`the scratch directory is kept at ${work}`);
  }
  if (step.id === "unpack") checkDownload();
  if (reads) checkNotarization(output);
}

if (removable) rmSync(work, { recursive: true, force: true });

console.log(
  dryRun
    ? `\ndry run: nothing ran, and nothing was written — ${work} was named, not created`
    : `\n${safariAppZipName(version)} is notarized, stapled and on ${extensionTag(version)}`,
);
