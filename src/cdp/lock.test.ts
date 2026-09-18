import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { driverLock } from "./lock.ts";

function home(): string {
  return mkdtempSync(path.join(tmpdir(), "lock-"));
}

/** A pid nothing can be running under: `kill(0)` on it always throws, so the holder reads as dead. */
const DEAD_PID = 0x7ffffff0;

function writeHolder(dir: string, pid: number): string {
  const file = path.join(dir, "driver.lock");
  writeFileSync(file, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
  return file;
}

test("creating the lock writes nothing: the role begins at the first act", () => {
  const dir = home();
  const lock = driverLock(dir);
  assert.deepEqual(lock.contention(), { contended: false, holder: null });
  assert.throws(() => readFileSync(path.join(dir, "driver.lock"), "utf8"));
});

test("take writes our pid and reports the tab free", () => {
  const dir = home();
  const lock = driverLock(dir);
  assert.deepEqual(lock.take(), { contended: false, holder: null });
  const { pid } = JSON.parse(readFileSync(path.join(dir, "driver.lock"), "utf8")) as { pid: number };
  assert.equal(pid, process.pid);
});

test("take is idempotent: a second act by the same driver still holds it", () => {
  const dir = home();
  const lock = driverLock(dir);
  lock.take();
  assert.deepEqual(lock.take(), { contended: false, holder: null });
  assert.deepEqual(lock.contention(), { contended: false, holder: null });
});

test("a live holder that is not us contends, and take does not steal the file", () => {
  const dir = home();
  // `process.ppid` is alive and is not this process: the shape of a second session.
  const file = writeHolder(dir, process.ppid);
  const lock = driverLock(dir);
  assert.deepEqual(lock.contention(), { contended: true, holder: process.ppid });
  assert.deepEqual(lock.take(), { contended: true, holder: process.ppid });
  const { pid } = JSON.parse(readFileSync(file, "utf8")) as { pid: number };
  assert.equal(pid, process.ppid, "the live holder keeps the lock");
});

test("a dead holder is taken over", () => {
  const dir = home();
  writeHolder(dir, DEAD_PID);
  const lock = driverLock(dir);
  assert.deepEqual(lock.contention(), { contended: false, holder: null });
  assert.deepEqual(lock.take(), { contended: false, holder: null });
  const { pid } = JSON.parse(readFileSync(path.join(dir, "driver.lock"), "utf8")) as { pid: number };
  assert.equal(pid, process.pid);
});

test("an unreadable lock is taken over", () => {
  const dir = home();
  writeFileSync(path.join(dir, "driver.lock"), "not json");
  const lock = driverLock(dir);
  assert.deepEqual(lock.take(), { contended: false, holder: null });
  const { pid } = JSON.parse(readFileSync(path.join(dir, "driver.lock"), "utf8")) as { pid: number };
  assert.equal(pid, process.pid);
});

test("contention re-reads: a second driver that appears after we took it wins", () => {
  const dir = home();
  const lock = driverLock(dir);
  lock.take();
  writeHolder(dir, process.ppid);
  assert.deepEqual(lock.contention(), { contended: true, holder: process.ppid });
  assert.deepEqual(lock.take(), { contended: true, holder: process.ppid });
});

test("a reader never locks an actor out", () => {
  const dir = home();
  const reader = driverLock(dir);
  const actor = driverLock(dir);
  reader.contention();
  reader.contention();
  assert.deepEqual(actor.take(), { contended: false, holder: null });
});
