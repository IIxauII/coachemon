/**
 * The Safari half of a release, run by hand on the dev's Mac (§14.6). Safari is not a store and this is not CI: the
 * build needs an individual Apple Developer Program membership, a Developer ID Application identity in the login
 * keychain, Xcode, and a `notarytool` credential profile. `docs/runbooks/safari-release.md` sets those up once.
 *
 *   node scripts/release/safari-release.ts 0.1.0
 *   node scripts/release/safari-release.ts 0.1.0 --dry-run
 *
 * It takes the release's own `coachemon-safari-web-extension-<v>.zip`, packages it into the generated near-shell,
 * signs, notarizes, staples, and uploads `Coachemon-safari-<v>.zip` back onto the same release. Every step is one of
 * `safariSteps`, which `src/safari-release.test.ts` covers; everything here is the part a test cannot reach.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  developerIdIdentities,
  exportOptions,
  extensionTag,
  packagedVersion,
  pickIdentity,
  safariPaths,
  safariSteps,
  teamIdFrom,
} from "./safari.ts";
import { releaseVersion, safariAppZipName } from "./artifacts.ts";
import { versionArg } from "./version.ts";

const version = releaseVersion(versionArg("scripts/release/safari-release.ts <semver> [--identity <id>]"));
const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const dryRun = process.argv.includes("--dry-run");
const keep = process.argv.includes("--keep") || dryRun;
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

// `xcrun` without a selected Xcode resolves the Command Line Tools, which carry no `safari-web-extension-packager`.
const identity = ((): string => {
  try {
    capture("xcode-select", ["-p"]);
  } catch {
    missing("no Xcode is selected; run `sudo xcode-select -s /Applications/Xcode.app`");
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

// One scratch directory per run, so a rerun after a failure never packages last attempt's leftovers.
const work = flag("work") ?? mkdtempSync(join(tmpdir(), `coachemon-safari-${version}-`));
mkdirSync(work, { recursive: true });
const paths = safariPaths(work, version);
const steps = safariSteps({ version, work, identity, profile });

console.log(`${extensionTag(version)} → ${paths.asset}`);
console.log(`  identity  ${identity}`);
console.log(`  team      ${teamId}`);
console.log(`  notarytool profile  ${profile}`);
console.log(`  scratch   ${work}${keep ? "" : " (removed when this finishes)"}`);

writeFileSync(paths.exportOptions, exportOptions(teamId));

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

const quote = (arg: string) => (/^[\w./:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`);

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.title}`);
  console.log(`  ${[step.command, ...step.args].map(quote).join(" ")}`);
  if (dryRun) continue;
  try {
    execFileSync(step.command, step.args, { cwd: work, stdio: "inherit" });
  } catch (error) {
    // Notarization and the archive are slow and their logs are where a failure is diagnosed, so a failed run leaves
    // the scratch directory behind and says where it is. Nothing is uploaded, because the upload is the last step.
    console.error(`\n${step.title.toLowerCase()} failed: ${(error as Error).message}`);
    die(`the scratch directory is kept at ${work}`);
  }
  if (step.title.startsWith("Unpack")) checkDownload();
}

if (!keep) rmSync(work, { recursive: true, force: true });

console.log(
  dryRun
    ? `\ndry run: nothing was downloaded, built or uploaded`
    : `\n${safariAppZipName(version)} is notarized, stapled and on ${extensionTag(version)}`,
);
