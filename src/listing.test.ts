import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DESCRIPTION } from "../extension/src/build/manifest.ts";
import { sourcesZipName } from "../scripts/release/artifacts.ts";
import { DISCLAIMER, LISTING_ASSETS, PRIVACY_URL, SUPPORT_EMAIL, listingPath, pngSize, repoPath } from "../scripts/listing/listing.ts";

const listing = (rel: string) => readFileSync(listingPath(rel), "utf8");
const privacy = () => readFileSync(repoPath("PRIVACY.md"), "utf8");

test("the disclaimer is one wording, in the manifest, the HUD and every listing text", () => {
  // The manifest says it in one sentence rather than two, so it carries the affiliation half verbatim (§3).
  assert.equal(DESCRIPTION.includes(DISCLAIMER.replace("Unofficial. ", "")), true);
  const hud = readFileSync(repoPath("skills/coachemon/scripts/hud/90-render.js"), "utf8");
  assert.equal(hud.includes(DISCLAIMER), true);
  for (const doc of ["description.md", "store-disclosure.md"]) assert.equal(listing(doc).includes(DISCLAIMER), true);
  assert.equal(privacy().includes(DISCLAIMER), true);
});

test("the description follows the skeleton order", () => {
  const body = listing("description.md");
  const at = (s: string) => {
    const i = body.indexOf(s);
    assert.notEqual(i, -1, `description is missing ${s}`);
    return i;
  };
  // 1 the one-sentence opener, 2 the cards, 3 where it runs, 4 privacy, 5 the agent, 6 source, 7 the disclaimer (§3.1).
  const order = [at("PokéRogue"), at("Mystery Encounter"), at("pokerogue.net"), at("Nothing leaves your computer"),
    at("MCP"), at("AGPL-3.0-only"), at(DISCLAIMER)];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // Orion is named in the store bodies (§3); Claude is named nominatively, and only in the closing paragraph, which
  // is the one that names MCP — never in the opener, the card list or the privacy line.
  assert.equal(body.includes("Orion"), true);
  const closing = body.slice(at("Nothing leaves your computer"), at("AGPL-3.0-only"));
  assert.equal(closing.split("Claude").length - 1, 1, "Claude belongs in the closing paragraph, once");
  assert.equal(body.split("Claude").length - 1, 1, "Claude is named nowhere else in the body");
});

test("the copy never puts the game in the title or the keywords", () => {
  // The section that fills those two form fields, not the file's intro: the game is named in the body and nowhere
  // above it (§3).
  const body = listing("description.md");
  const start = body.indexOf("## Title and keywords");
  assert.notEqual(start, -1);
  const fields = body.slice(0, body.indexOf("\n## ", start + 1));
  for (const word of ["PokéRogue", "Pokémon", "Pokemon"]) assert.equal(fields.includes(word), false, `${word} is in the title or keywords`);
});

test("the AMO source submission names the zip the release actually builds", () => {
  const filed = listing("store-disclosure.md");
  // Both halves drifted from the release once already: the zip was named back to front, and the build line dropped
  // `--mode store`, which is the difference between `firefox-mv3-store` and a build the reviewer cannot match (§5.7).
  assert.equal(filed.includes(sourcesZipName("<version>")), true, "the filed zip name is not the one that is built");
  const build = /^cd extension && .*$/m.exec(readFileSync(repoPath("SOURCES.md"), "utf8"));
  assert.notEqual(build, null);
  assert.equal(filed.includes(build![0]), true, "the filed build line is not SOURCES.md's");
});

test("the privacy policy says what §6 says, and where to write", () => {
  // Jekyll only renders a page with front matter, so `/PRIVACY` is a 404 without it (§3).
  assert.equal(privacy().startsWith("---\n"), true);
  for (const claim of ["127.0.0.1", "Nothing is sent to any server", "No analytics", SUPPORT_EMAIL]) {
    assert.equal(privacy().includes(claim), true, `PRIVACY.md is missing ${claim}`);
  }
});

test("both store disclosures answer every form field", () => {
  const filed = listing("store-disclosure.md");
  for (const field of ["Single purpose", "Host access", "Remote code", "Data usage", PRIVACY_URL,
    "GNU Affero General Public License v3.0 only", "data_collection_permissions", SUPPORT_EMAIL]) {
    assert.equal(filed.includes(field), true, `store-disclosure.md is missing ${field}`);
  }
  // Remote code is **Yes**: the HUD imports pokerogue.net's own modules (§6). Saying no would be a false filing.
  assert.match(filed, /Remote code[^\n]*\*\*Yes\*\*/);
});

test("every asset the forms ask for is in the repo at the size they ask for", () => {
  for (const asset of LISTING_ASSETS) {
    assert.deepEqual(pngSize(readFileSync(listingPath(asset.file))), { width: asset.width, height: asset.height },
      `${asset.file} is the wrong size`);
  }
});

test("pngSize reads the header rather than trusting the name", () => {
  assert.throws(() => pngSize(Buffer.from("not a png")), /not a PNG/);
});
