/**
 * The Safari half of a release, run by hand on the dev's Mac (§14.6). Safari is not a store and this is not CI: the
 * build needs an individual Apple Developer Program membership, a Developer ID Application identity in the login
 * keychain, Xcode, and a `notarytool` credential profile. `docs/runbooks/safari-release.md` sets those up once.
 *
 *   node scripts/release/safari-release.ts 0.1.0
 *   node scripts/release/safari-release.ts 0.1.0 --dry-run
 *
 * It takes the release's own `coachemon-safari-web-extension-<v>.zip`, packages it into the generated near-shell,
 * signs, notarizes, staples, and uploads `Coachemon-safari-<v>.zip` back onto the same release. The steps and their
 * order are `safariSteps` in `safari.ts`, which `src/safari-release.test.ts` covers. What is here is the rest: the
 * preflight, the scratch directory, and the one check that reads a file the plan produced.
 */
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

/**
 * A dry run prints the plan and runs none of it, so it is the one mode that has to work before the membership exists:
 * §16 leaves enrolment off-map, and until it lands this is how the dev reads what the release will do. So a missing
 * tool or identity is a warning here and a refusal everywhere else.
 */
const missing = (message: string): void => {
  if (!dryRun) die(message);
  console.warn(`! ${message}`);
};

const capture = (command: string, args: string[]): string =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** This checkout, found from the script rather than from the shell's cwd, which by then is the scratch directory. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Nothing below exists off macOS, and a half-run that fails at `xcrun` has already downloaded and unpacked.
if (process.platform !== "darwin") missing(`the Safari release runs on macOS only (this is ${process.platform})`);
for (const tool of ["xcrun", "xcodebuild", "ditto", "spctl", "gh", "security"]) {
  try {
    capture("/usr/bin/which", [tool]);
  } catch {
    missing(`${tool} is not on PATH; see docs/runbooks/safari-release.md`);
  }
}

/** What a dry run signs with when the keychain holds nothing yet: shaped like an identity, valid for nothing. */
const PLACEHOLDER = "Developer ID Application: <not enrolled yet> (TEAMID1234)";

const identity = ((): string => {
  // Asked of the converter rather than of `xcode-select -p`, which prints the Command Line Tools path just as
  // happily: those are on every dev Mac, ship no converter, and would fail three steps in.
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
 * The scratch directory. A fresh one per run, because a rerun after a failure must not package last attempt's
 * leftovers — but `--work` is a path a human typed, so it is required to be empty rather than emptied: this script
 * deletes only a directory it made itself.
 *
 * A dry run wants the real paths inside the commands it prints and has nothing to put in them, so it names a
 * directory and never creates one. That is also what lets it run before any of the setup exists.
 */
function scratchDir(): string {
  const asked = flag("work");
  if (dryRun) return asked ?? join(tmpdir(), `coachemon-safari-${version}`);
  if (!asked) return mkdtempSync(join(tmpdir(), `coachemon-safari-${version}-`));
  mkdirSync(asked, { recursive: true });
  if (readdirSync(asked).length > 0) die(`${asked} is not empty; the build would package whatever is already in it`);
  return asked;
}

/**
 * The repo the release lives on. Read off this checkout's `origin` rather than written down, because `gh` runs in the
 * scratch directory, which is no checkout, and cannot work it out for itself there.
 */
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
// Only a directory this run made is one this run may remove: `--work` is a path a human typed, and a dry run makes
// no directory at all.
const removable = !keep && !dryRun && !flag("work");

console.log(`${extensionTag(version)} → ${paths.asset}`);
console.log(`  identity  ${identity}`);
console.log(`  team      ${teamId}`);
console.log(`  notarytool profile  ${profile}`);
if (!dryRun) console.log(`  scratch   ${work}${removable ? " (removed when this finishes)" : ""}`);

if (!dryRun) writeFileSync(paths.exportOptions, exportOptions(teamId));

/**
 * What the packager is about to eat, against what was asked for. `gh release download` leaves whatever is already in
 * the directory when it matches nothing, so without this a rerun after a botched download quietly wraps the previous
 * release's extension in an app named for this one.
 */
function checkDownload(): void {
  const manifest = join(paths.unpacked, "manifest.json");
  if (!existsSync(manifest)) die(`${paths.unpacked} holds no manifest.json; the download was not the store build`);
  const found = packagedVersion(readFileSync(manifest, "utf8"));
  if (found !== version) die(`the downloaded extension is ${found}, not ${version}; ${extensionTag(version)} is wrong`);
  console.log(`  manifest  ${found} ✓`);
}

/**
 * Apple's verdict, which the notarize step's exit code does not carry: `--wait` exits 0 on `Invalid` too (#241).
 * Read here rather than left to the staple that follows, which fails for want of a ticket and names the wrong step.
 */
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
  // Only the notarize step's stdout is read, and it is the one step whose output is machine-readable rather than a
  // log to watch; every other step streams straight through, because that is where a slow build shows progress.
  const reads = step.id === "notarize";
  let output = "";
  try {
    if (reads) {
      output = execFileSync(step.command, step.args, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    } else {
      execFileSync(step.command, step.args, { cwd: work, stdio: "inherit" });
    }
  } catch (error) {
    // Notarization and the archive are slow and their logs are where a failure is diagnosed, so a failed run leaves
    // the scratch directory behind and says where it is. Nothing is uploaded, because the upload is the last step.
    console.error(`\n${step.title.toLowerCase()} failed: ${(error as Error).message}`);
    // A step that was read rather than streamed said whatever it had to say down the pipe, so it is printed here or
    // nowhere — and for a notarization that is the one place the submission id appears.
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
