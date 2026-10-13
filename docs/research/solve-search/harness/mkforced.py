#!/usr/bin/env python3
# usage: mkforced.py <out-job.json> [id,id,...] — forced-move cases built on the W180 save with the test framework's
# overrides (a moveset via changeMoveset, PP left), each played chained and straight (solve.test.ts `forced`), plus a
# fork check. Most open as the winning line does (Dragon Pulse, then Probopass takes Gigalith's Explosion), so the case
# plays out against Carracosta and later foes instead of ending in the explosion.
import json, sys

R = "Reshiram"
OPEN = [{"m": "DRAGON_PULSE"}, {"s": "Probopass"}]
cases = [
    # Struggle: Snorlax (no Leppa Berry) with one PP of Body Slam left, then nothing.
    {"id": "struggle", "setup": [{"mon": "Snorlax", "ppLeft": {"*": 0, "BODY_SLAM": 1}}],
     "script": OPEN + [{"s": "Snorlax"}] + [{"m": "BODY_SLAM"}] * 3 + [{"m": "STRUGGLE"}] * 9},
    # Struggle with Tera, then out and back in: PP stays spent across a switch.
    {"id": "struggle-tera", "setup": [{"mon": "Snorlax", "ppLeft": {"*": 0}}],
     "script": OPEN + [{"s": "Snorlax"}, {"m": "STRUGGLE", "tera": True}, {"s": R}, {"s": "Snorlax"}]
     + [{"m": "STRUGGLE"}] * 6},
    # Reshiram's Leppa Berry refills a move when the last PP goes: Struggle is offered only while nothing is left.
    {"id": "struggle-leppa", "setup": [{"mon": R, "ppLeft": {"*": 0, "DRAGON_PULSE": 1}}],
     "script": [{"m": "DRAGON_PULSE"}, {"m": "STRUGGLE"}, {"m": "HYPER_VOICE"}, {"m": "STRUGGLE"}]},
    # Recharge moves.
    {"id": "recharge", "setup": [{"mon": R, "moves": ["HYPER_BEAM", "GIGA_IMPACT", "DRAGON_PULSE", "BLUE_FLARE"]}],
     "script": OPEN + [{"s": R}, {"m": "HYPER_BEAM"}, {"m": "GIGA_IMPACT"}, {"m": "HYPER_BEAM", "tera": True},
                       {"m": "GIGA_IMPACT"}, {"m": "HYPER_BEAM"}, {"m": "GIGA_IMPACT"}, {"m": "HYPER_BEAM"}]},
    # Rampages: Outrage, Thrash, Petal Dance, with the confusion they end in.
    {"id": "rampage", "setup": [{"mon": R, "moves": ["OUTRAGE", "THRASH", "PETAL_DANCE", "DRAGON_PULSE"]}],
     "script": OPEN + [{"s": R}, {"m": "OUTRAGE"}, {"m": "THRASH"}, {"m": "PETAL_DANCE"}, {"m": "OUTRAGE"},
                       {"m": "THRASH"}, {"m": "PETAL_DANCE"}]},
    # Charge moves other than Bounce.
    {"id": "charge", "setup": [{"mon": R, "moves": ["SOLAR_BEAM", "FLY", "DIG", "DRAGON_PULSE"]}],
     "script": OPEN + [{"s": R}, {"m": "SOLAR_BEAM"}, {"m": "FLY"}, {"m": "DIG"}, {"m": "SOLAR_BEAM"}, {"m": "FLY"},
                       {"m": "DIG"}]},
    # The foe's forced moves: the lead Gigalith given one move, so the AI must use it, while we only switch and so
    # keep it alive. (Editing a benched foe instead changes which foe the trainer sends next.) The snapshot carries an
    # on-field foe's summonData (the augmented export), which is what holds its queue and tags.
    {"id": "foe-recharge", "setup": [{"mon": "Gigalith", "foe": True, "moves": ["HYPER_BEAM"]}],
     "script": [{"s": "Snorlax"}, {"s": "Probopass"}] * 4},
    {"id": "foe-rampage", "setup": [{"mon": "Gigalith", "foe": True, "moves": ["OUTRAGE"]}],
     "script": [{"s": "Probopass"}, {"s": "Snorlax"}] * 4},
    {"id": "foe-charge", "setup": [{"mon": "Gigalith", "foe": True, "moves": ["FLY"]}],
     "script": [{"s": "Snorlax"}, {"s": "Probopass"}] * 4},
    # Bounce as Gyarados has it in the save: the trap the long lines found, as a baseline.
    {"id": "bounce", "setup": [],
     "script": OPEN + [{"s": "Gyarados"}, {"m": "BOUNCE"}, {"m": "BOUNCE"}, {"m": "HYDRO_PUMP"}, {"m": "BOUNCE"}]},
]
only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
for c in cases:
    c.update(kind="forced", n=14, fork=True)
json.dump({"jobs": [c for c in cases if not only or c["id"] in only]}, open(sys.argv[1], "w"))
