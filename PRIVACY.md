---
title: Coachemon privacy policy
---

# Coachemon privacy policy

Last updated: 14 October 2026.

Coachemon is a browser extension that draws a coach overlay on the PokéRogue game you are playing.

## What it reads

Coachemon reads the PokéRogue game in your tab — your party, the enemy, the wave, the menu on screen — to draw the
coach. It reads your run's save only to pass it to the local program described below. It runs on `pokerogue.net` and
nowhere else, and it reads nothing until you open that site yourself.

## Where it goes

**Nothing is sent to any server.** Coachemon has no backend, and its only network traffic is to your own computer.

If you also run the Coachemon plugin for Claude Code on the same computer, the extension passes game state and coach
text to that program over a local connection (`127.0.0.1`), and only while a `pokerogue.net` tab is open. On Firefox
it does that only after you click the Coachemon toolbar icon once. What that program does with what it receives is
governed by that program, not by this policy.

When that program asks, the extension also passes it your run's save: the run as it stands, and the save PokéRogue
keeps in the page's `localStorage` at the start of each wave, the one Continue loads. PokéRogue keeps one such save per
account that has played that save slot in this browser, and the extension passes every one of them, as the game stores
them. The game's encryption of a save uses a key built into the game, so it hides nothing from that program: it opens
each one and keeps the one belonging to the run you are playing. It goes over the same local connection and nowhere
else.

Nothing you type into the game — your account name, your password, anything in a form — is ever read or passed on.

## What it stores

Two entries, on your own machine, both in the page's `localStorage`:

- `coach-hud-panel`: which view of the coach panel you last picked.
- `coach-me-journal`: the coach's journal. For each Mystery Encounter you meet, it keeps the card the coach showed, the
  option you picked and the state of your run around it, so the coach's advice can be checked against what happened.
  It keeps only the most recent entries and drops the oldest.

There is no account, no profile and no identifier of any kind.

## What it does not do

**No analytics, no accounts, no cookies of our own.** Nothing is sold, nothing is transferred to anyone, and nothing
is used for anything but drawing the coach.

## Permissions

The whole permission set is one content script on `https://pokerogue.net/*`. Coachemon asks for no browsing history,
no other sites, no file access and no storage permission.

## Changes

This page is the policy. Its history is the repository's:
<https://github.com/IIxauII/coachemon/commits/master/PRIVACY.md>.

## Contact

Write to **xauyxau+coachemon@gmail.com**. The repository is public but is not a support channel.

---

Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.
