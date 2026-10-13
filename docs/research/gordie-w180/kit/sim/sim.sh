#!/bin/sh
# usage: sim.sh <script.json> <out.json>
C=/Users/xau/Documents/projects/coachemon/.cache/pokerogue/v1.12.0.11
J=/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim
cp $J/gordie-sim.test.ts $C/test/tests/zz-gordie-sim.test.ts
cd $C && GORDIE_SESSION=$J/session-w180.json GORDIE_SCRIPT=$1 GORDIE_OUT=$2 npx --yes pnpm@10.33.2 exec vitest run test/tests/zz-gordie-sim.test.ts > $J/sim.log 2>&1
rc=$?
rm -f $C/test/tests/zz-gordie-sim.test.ts
tail -5 $J/sim.log
exit $rc
