import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPublicSessionState,
  readLegacyPublicSessionCandidate,
  readPublicSessionState,
  savePublicSessionState,
  type PublicSessionOwnership,
} from "../lib/publicSessionStorage";
import { markCompletedSession, readCompletedSession, readCompletedTable } from "../lib/customerCompletion";
import { markDetachedSession, readDetachedSession } from "../lib/customerDetachment";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const owner: PublicSessionOwnership = {
  restaurantId: 11,
  restaurantSlug: "cafe-one",
  tableId: 21,
  tableCode: "T1",
  sessionToken: "session-one",
};

function withStorage(run: (local: Storage, session: Storage) => void) {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  globalThis.window = { localStorage, sessionStorage } as unknown as Window & typeof globalThis;
  try { run(localStorage, sessionStorage); } finally { delete (globalThis as { window?: Window }).window; }
}

test("same restaurant, table, and dining session retains public state", () => withStorage(() => {
  savePublicSessionState(owner, "participant-one");
  assert.deepEqual(readPublicSessionState(owner), {
    ownership: owner,
    participantToken: "participant-one",
  });
}));

test("different restaurant rejects and discards saved public state", () => withStorage(() => {
  savePublicSessionState(owner, "participant-one");
  assert.equal(readPublicSessionState({ ...owner, restaurantId: 12, restaurantSlug: "cafe-two" }), null);
  assert.equal(readPublicSessionState(owner), null);
}));

test("different table rejects and discards saved public state", () => withStorage(() => {
  savePublicSessionState(owner, "participant-one");
  assert.equal(readPublicSessionState({ ...owner, tableId: 22, tableCode: "T2" }), null);
  assert.equal(readPublicSessionState(owner), null);
}));

test("different dining session rejects and discards old public state", () => withStorage(() => {
  savePublicSessionState(owner, "participant-one");
  assert.equal(readPublicSessionState({ ...owner, sessionToken: "session-two" }), null);
  assert.equal(readPublicSessionState(owner), null);
}));

test("unsafe legacy strings are validation candidates, not trusted restored state", () => withStorage((local, session) => {
  local.setItem("nadha_public_dining_session:cafe-one:T1", "legacy-session");
  local.setItem("omlu_table_participant:cafe-one:T1", "legacy-participant");
  assert.equal(readPublicSessionState(owner), null);
  assert.deepEqual(readLegacyPublicSessionCandidate("cafe-one", "T1"), {
    sessionToken: "legacy-session",
    participantToken: "legacy-participant",
  });
  clearPublicSessionState("cafe-one", "T1");
  assert.equal(local.length + session.length, 0);
}));

test("validated scope promotion removes legacy scalar records", () => withStorage((local) => {
  local.setItem("nadha_public_dining_session:cafe-one:T1", "legacy-session");
  local.setItem("omlu_table_participant:cafe-one:T1", "legacy-participant");
  savePublicSessionState(owner, "participant-one");
  assert.equal(readLegacyPublicSessionCandidate("cafe-one", "T1"), null);
  assert.equal(readPublicSessionState(owner)?.participantToken, "participant-one");
}));

test("completion and detached markers reject mismatched ownership", () => withStorage(() => {
  markCompletedSession({
    sessionToken: "session-one",
    restaurantSlug: "cafe-one",
    restaurantName: "Cafe One",
    tableCode: "T1",
    billStatus: "paid",
  });
  assert.equal(readCompletedSession("session-one")?.tableCode, "T1");
  assert.equal(readCompletedTable("cafe-two", "T1"), null);

  markDetachedSession({
    sessionToken: "session-one",
    restaurantSlug: "cafe-one",
    restaurantName: "Cafe One",
    tableCode: "T1",
    receiptToken: "receipt-one",
  });
  assert.equal(readDetachedSession("session-one", { restaurantSlug: "cafe-one", tableCode: "T2" }), null);
}));
