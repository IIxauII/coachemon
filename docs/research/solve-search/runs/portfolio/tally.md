| run | root | share | stop | found by | line | alive | expansions to answer (total) | search s to replayed win | boot s | peak total MB | peak worker MB | replayed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| p4-a1T21 | A1:20 | on | replayed win | W8@1 | 30 steps (10 searched) | 1 of 6 | 550 (572) | 109.4 | 9.9 | 3389 | 873 | 3/3 |
| p4-t1-budget8000 | T1 | on | replayed win | W8@0.5 | 14 steps (14 searched) | 5 of 6 | 4861 (4896) | 1066.7 | 8.7 | 5128 | 2107 | 5/5 |
| p8-a1T21 | A1:20 | on | replayed win | W8@1 | 30 steps (10 searched) | 1 of 6 | 606 (664) | 87.4 | 20.8 | 3293 | 594 | 3/3 |
| p8-t1 | T1 | on | budget | – | – | – | – (3186) | 319.6 (no answer) | 32.3 | 4234 | 960 | – |

| run | beam | status | layers | actions dispatched | children consumed | tasks created | tasks reused | losses | stalled | wins |
|---|---|---|---|---|---|---|---|---|---|---|
| p4-a1T21 | W8@0.5 | running | 6 | 217 | 213 | 49 | 0 | 30 | 0 | 0 |
| p4-a1T21 | W8@1 | replaying | 10 | 212 | 317 | 51 | 17 | 110 | 0 | 3 |
| p4-a1T21 | W16@0.5 | running | 6 | 159 | 371 | 36 | 54 | 94 | 0 | 0 |
| p4-t1-budget8000 | W8@0.5 | replaying | 14 | 930 | 1657 | 99 | 6 | 0 | 0 | 21 |
| p4-t1-budget8000 | W8@1 | running | 20 | 942 | 1959 | 130 | 31 | 0 | 56 | 0 |
| p4-t1-budget8000 | W16@0.5 | running | 8 | 949 | 1838 | 109 | 17 | 0 | 0 | 0 |
| p8-a1T21 | W8@0.5 | emptied | 7 | 239 | 245 | 47 | 2 | 62 | 0 | 0 |
| p8-a1T21 | W8@1 | replaying | 10 | 222 | 317 | 53 | 15 | 110 | 0 | 3 |
| p8-a1T21 | W16@0.5 | emptied | 8 | 207 | 477 | 46 | 54 | 190 | 0 | 0 |
| p8-t1 | W8@0.5 | running | 9 | 636 | 945 | 67 | 6 | 0 | 0 | 0 |
| p8-t1 | W8@1 | running | 14 | 634 | 1537 | 82 | 31 | 0 | 0 | 0 |
| p8-t1 | W16@0.5 | running | 6 | 638 | 1165 | 77 | 17 | 0 | 0 | 0 |

| run | W | P | root | result | layers | children | to first win | search s | boot s | children/s | peak total MB | peak worker MB | replayed from T1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| single-w8p4-stall6 | 8 | 4 | T1 | win, 14-step line, 5 of 6 alive | 14 | 1657 | 1657 | 259.1 | 8.1 | 6.39 | 4348 | 1196 | 5/5 |
| single-w8w1p4-a1T21 | 8 | 4 | A1:20 | win, 30-step line, 1 of 6 alive | 10 | 317 | 317 | 79.7 | 9.0 | 3.98 | 3132 | 905 | 3/3 |
