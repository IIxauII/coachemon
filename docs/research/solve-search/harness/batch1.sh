#!/bin/sh
S=/Users/xau/Documents/projects/coachemon/.claude/worktrees/agent-acc9f3a420e27c558/docs/research/solve-search/harness/sweep.sh
R=/Users/xau/.claude/jobs/bf9a05d3/tmp/sw
uptime
# beam width, 8 workers, from T1
$S $R w1p8 --workers 8 --width 1
$S $R w2p8 --workers 8 --width 2
$S $R w4p8 --workers 8 --width 4
$S $R w8p8 --workers 8 --width 8
$S $R w16p8 --workers 8 --width 16
uptime
# mid-fight re-solves, width 8, 8 workers
$S $R mid-T5-online --workers 8 --width 8 --prefix WIN:4
$S $R mid-T8-cardT7 --workers 8 --width 8 --prefix CARD_T7:7
$S $R mid-a1T9 --workers 8 --width 8 --prefix A1:8
$S $R mid-a1T17 --workers 8 --width 8 --prefix A1:16
$S $R mid-a1T19 --workers 8 --width 8 --prefix A1:18
$S $R mid-a1T21 --workers 8 --width 8 --prefix A1:20
uptime
# concurrency: the first ~500 children of the width-8 search at 1, 2, 4, 8, 10 workers
$S $R p1 --workers 1 --width 8 --budget-children 500
$S $R p2 --workers 2 --width 8 --budget-children 500
$S $R p4 --workers 4 --width 8 --budget-children 500
$S $R p8 --workers 8 --width 8 --budget-children 500
$S $R p10 --workers 10 --width 8 --budget-children 500
uptime
# heuristic weight
$S $R w8p8-ours0 --workers 8 --width 8 --ours-weight 0
$S $R w8p8-ours1 --workers 8 --width 8 --ours-weight 1
uptime
echo BATCH1 DONE
