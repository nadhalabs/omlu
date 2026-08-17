import assert from "node:assert/strict";
import test from "node:test";
import {
  KITCHEN_ORDER_ALERT_PATH,
  KitchenOrderAlert,
  NewKitchenTicketTracker,
} from "../lib/kitchenOrderAlert.mjs";

const ticket = (public_token, status = "pending") => ({ public_token, status });

test("initial existing tickets establish the baseline without alerting", () => {
  const tracker = new NewKitchenTicketTracker();
  assert.equal(tracker.observe([ticket("A"), ticket("B")]), false);
});

test("one genuinely new pending ticket alerts once and duplicates do not replay", () => {
  const tracker = new NewKitchenTicketTracker();
  tracker.observe([ticket("A")]);
  assert.equal(tracker.observe([ticket("A"), ticket("B")]), true);
  assert.equal(tracker.observe([ticket("A"), ticket("B")]), false);
});

test("status changes never count as new kitchen tickets", () => {
  const tracker = new NewKitchenTicketTracker();
  tracker.observe([ticket("A")]);
  assert.equal(tracker.observe([ticket("A", "accepted")]), false);
  assert.equal(tracker.observe([ticket("A", "preparing")]), false);
  assert.equal(tracker.observe([ticket("A", "ready")]), false);
});

test("several tickets in one reconciliation produce one alert decision", () => {
  const tracker = new NewKitchenTicketTracker();
  tracker.observe([]);
  assert.equal(tracker.observe([ticket("A"), ticket("B"), ticket("C")]), true);
  assert.equal(tracker.observe([ticket("A"), ticket("B"), ticket("C")]), false);
});

test("audio is preloaded at full volume and cooldown batches close arrivals", async () => {
  let now = 10_000;
  let plays = 0;
  let loads = 0;
  const audio = {
    currentTime: 8,
    muted: false,
    pause() {},
    play: async () => { plays += 1; },
    load() { loads += 1; },
  };
  const alert = new KitchenOrderAlert({
    createAudio: () => audio,
    cooldownMs: 2_000,
    now: () => now,
  });

  alert.preload();
  assert.equal(audio.preload, "auto");
  assert.equal(audio.volume, 1.0);
  assert.equal(loads, 1);
  assert.equal(alert.play(), true);
  assert.equal(alert.play(), false);
  await Promise.resolve();
  assert.equal(plays, 1);
  now += 2_001;
  assert.equal(alert.play(), true);
  await Promise.resolve();
  assert.equal(plays, 2);
  assert.equal(loads, 1, "the preloaded asset is reused rather than downloaded again");
});

test("playback failure is isolated from KDS rendering", async () => {
  const failures = [];
  const alert = new KitchenOrderAlert({
    createAudio: () => ({
      currentTime: 0,
      muted: false,
      pause() {},
      load() {},
      play: () => Promise.reject(new Error("autoplay blocked")),
    }),
    onFailure: (error) => failures.push(error),
  });
  assert.doesNotThrow(() => alert.play());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(failures.length, 1);
});

test("strong alert uses the documented public asset path", () => {
  assert.equal(KITCHEN_ORDER_ALERT_PATH, "/sounds/kitchen-order-alert.mp3");
});
