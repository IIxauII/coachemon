#!/bin/sh
# usage: pr.sh '<json for __P>'
node /var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/cdp.mjs "globalThis.__P=$1; $(cat /var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/predict.js)"
