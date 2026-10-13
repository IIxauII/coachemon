# The Gordie W180 lines this research replays, in solve.test.ts's step format:
# {m: MOVE_ID, tera?: true} or {s: switch-to name}; r = the replacement sent in if one of ours faints on that step.
WIN = [
    {"m": "DRAGON_PULSE"}, {"s": "Probopass"}, {"s": "Leavanny"}, {"m": "POLLEN_PUFF"}, {"m": "BUG_BITE"},
    {"m": "LEAF_STORM"}, {"m": "BUG_BITE"}, {"m": "LEAF_STORM"}, {"s": "Reshiram"}, {"m": "DRAGON_PULSE"},
    {"s": "Leavanny"}, {"m": "LEAF_STORM"}, {"m": "BUG_BITE", "r": "Golbat"}, {"m": "TOXIC"},
    {"m": "VENOSHOCK", "r": "Gyarados"}, {"m": "HYDRO_PUMP", "tera": True}, {"m": "HYDRO_PUMP"}, {"m": "HYDRO_PUMP"},
    {"m": "HYDRO_PUMP"},
]
# Attempt 1 as played live: lost at T23.
A1 = [
    {"m": "DRAGON_PULSE"}, {"s": "Probopass"}, {"m": "EARTH_POWER"}, {"s": "Leavanny"}, {"m": "LEAF_STORM"},
    {"m": "LEAF_STORM"}, {"s": "Probopass"}, {"s": "Gyarados"}, {"m": "HYDRO_PUMP"}, {"s": "Probopass"},
    {"m": "EARTH_POWER", "r": "Leavanny"}, {"m": "LEAF_STORM"}, {"s": "Snorlax"}, {"m": "BODY_SLAM"},
    {"m": "BODY_SLAM", "r": "Reshiram"}, {"m": "DRAGON_PULSE"}, {"m": "DRAGON_PULSE"},
    {"m": "DRAGON_PULSE", "r": "Gyarados"}, {"m": "HYDRO_PUMP"}, {"m": "HYDRO_PUMP", "r": "Golbat"},
    {"m": "VENOSHOCK"}, {"m": "TOXIC", "r": "Leavanny"}, {"m": "LEAF_STORM"},
]
# The card's T7 departure from the winning line (switch Leavanny out to Probopass): the deciding turn per
# research/gordie-hud-vs-engine.
CARD_T7 = WIN[:6] + [{"s": "Probopass"}]
