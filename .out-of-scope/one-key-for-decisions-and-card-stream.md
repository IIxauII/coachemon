# One key for the detector's decisions and the card stream

The overlay keeps two keys for "which card is this", and they stay separate.

## Why this is out of scope

The two keys answer different questions, so merging them changes behaviour in either direction.

- **The decision key** (`k1`..`k4` in the per-frame detector, `02-decision.js`) is a live game object plus plain
  values, compared with `===`: the battle object and turn for a command, the phase object plus money, lock and party
  moves for the shop. It
  decides when the watch rebuilds a card and when its cache is still good. It has to change on every turn and every buy.
- **The stream key** (`KINDS[kind].key` in `60-card.js`) is a string: the wave, plus the free rewards, the learner and
  move, or the encounter and its minigame turn. It decides when the card stream sends a new event, and it rides the wire
  as `key`. It has to stay put across turns, or the stream would send an event every turn and every buy.

| detector kind / stream kind | decision key | stream key |
|---|---|---|
| command / battle | battle, `turn`, `fieldIndex`, slot-0 command | wave |
| reward / rewards | phase, money, lock, party moves + held items | wave \| free reward names |
| learn | phase | wave \| mon \| move |
| encounter | phase | wave \| name \| minigame turn |

Moving the detector onto the stream key would stop rebuilds after a turn or a buy. Moving the stream onto the decision
key would flood it, and live objects can't cross the wire anyway. Nothing downstream reads the wire `key` beyond
checking it is a string, so there's no consumer asking for them to agree.

## Prior requests

- #891: "Unify the detector's decision key with the card table's stream key"
