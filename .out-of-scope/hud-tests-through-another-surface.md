# HUD tests through another surface than the bundle's expose mode

The overlay's tests reach each module by its file name, `__hud["35-team-plan"].teamPlan`, and `// @only tests:`
marks the exports only tests may use. They stay that way: no named test interface in front of the modules, and no
routing of module tests through `__coachHud.card()`.

## Why this is out of scope

**It is the decided design.** #185 made each `hud/NN-*.js` file a module and settled that "tests reach modules through
an expose mode" keyed by file name, with `@only` enforcing who may import what (`hud-bundle.mjs`). A named test
interface would add a second list of names to keep in step with the files, to solve a problem that hasn't come up: in
the bundle's history one HUD file has been renamed (`50-shop` → `52-shop`).

**Module tests are unit tests.** calendar, combatant, damage, enemyai, engine, judgment, journal, meter, movetraits,
party, projection, run, threats, bossplan, card and gametables check pure functions: calendar arithmetic, damage rolls,
AI scores. `__coachHud.card()` returns nothing until a decision is detected, so routing them through it means a full
fake scene per test, numbers asserted through card prose, and a failure that no longer names the function that broke.
journal, meter and gametables have no page to mount at all. The skeptic's review on #893 reached the same conclusion
("needs more fake decision detection, not less").

Golden tests that judge a whole card already go through the shared fake page (#893) and assert wire text (#894).

## Prior requests

- #899: "Replace __hud file-number reaches and @only tests exports with a named test interface"
- #895: "Route module-level HUD tests through __coachHud.card()"
