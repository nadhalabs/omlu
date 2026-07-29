import test from "node:test";
import assert from "node:assert/strict";

import {
  activateWebTenantScope,
  authenticatedCacheKey,
  configureAuthRuntimeForTests,
  getActiveWebTenantScope,
  getAuthorityGeneration,
  handleAuthenticationStatus,
  isAuthorityGenerationCurrent,
  prepareForAuthentication,
  registerAuthenticatedCleanup,
  resetAuthRuntimeForTests,
  scopeFingerprint,
  terminateWebAuthentication,
} from "../lib/authRuntime.mjs";

const scopeA = Object.freeze({
  restaurant_id: 10,
  actor_id: 100,
  role: "owner",
  authority_epoch: "v1.epoch-a",
});
const scopeB = Object.freeze({
  restaurant_id: 20,
  actor_id: 200,
  role: "owner",
  authority_epoch: "v1.epoch-b",
});

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }
  get length() {
    return this.values.size;
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function setupRuntime() {
  resetAuthRuntimeForTests();
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const calls = [];
  configureAuthRuntimeForTests({
    fetch: async (...args) => {
      calls.push(["fetch", ...args]);
      return { ok: true };
    },
    redirect: (path) => calls.push(["redirect", path]),
    localStorage: () => local,
    sessionStorage: () => session,
  });
  return { local, session, calls };
}

test("authenticated cache keys isolate tenant, actor, role, epoch, and filters", () => {
  setupRuntime();
  activateWebTenantScope(scopeA);
  const first = authenticatedCacheKey("analytics:performance", { period: "today" });

  resetAuthRuntimeForTests();
  configureAuthRuntimeForTests({
    fetch: async () => ({ ok: true }),
    redirect: () => undefined,
    localStorage: () => new MemoryStorage(),
    sessionStorage: () => new MemoryStorage(),
  });
  activateWebTenantScope(scopeB);
  const second = authenticatedCacheKey("analytics:performance", { period: "today" });
  assert.notEqual(first, second);

  for (const changed of [
    { ...scopeA, actor_id: 101 },
    { ...scopeA, role: "admin" },
    { ...scopeA, authority_epoch: "v1.epoch-new" },
  ]) {
    resetAuthRuntimeForTests();
    configureAuthRuntimeForTests({
      fetch: async () => ({ ok: true }),
      redirect: () => undefined,
      localStorage: () => new MemoryStorage(),
      sessionStorage: () => new MemoryStorage(),
    });
    activateWebTenantScope(changed);
    assert.notEqual(
      authenticatedCacheKey("analytics:performance", { period: "today" }),
      first,
    );
  }
});

test("explicit logout clears identity storage and cleanup before redirect", async () => {
  const { local, session, calls } = setupRuntime();
  activateWebTenantScope(scopeA);
  local.setItem("omlu:auth:draft", "A");
  local.setItem("staff-order-cart-4", "legacy A");
  local.setItem("theme", "dark");
  session.setItem("omlu:return:path", "/admin");
  let polling = true;
  let socketOpen = true;
  registerAuthenticatedCleanup(() => {
    polling = false;
    socketOpen = false;
    calls.push(["cleanup"]);
  });

  await terminateWebAuthentication({ reason: "explicit_logout" });

  assert.equal(getActiveWebTenantScope(), null);
  assert.equal(local.getItem("omlu:auth:draft"), null);
  assert.equal(local.getItem("staff-order-cart-4"), null);
  assert.equal(session.getItem("omlu:return:path"), null);
  assert.equal(local.getItem("theme"), "dark");
  assert.equal(polling, false);
  assert.equal(socketOpen, false);
  assert.deepEqual(calls.map((call) => call[0]), ["cleanup", "fetch", "redirect"]);
});

test("A teardown completes before B can establish scope", async () => {
  const { local, calls } = setupRuntime();
  activateWebTenantScope(scopeA);
  local.setItem("omlu:auth:tables", "restaurant A");
  let cleanupFinished = false;
  registerAuthenticatedCleanup(async () => {
    await Promise.resolve();
    cleanupFinished = true;
  });

  await prepareForAuthentication();
  assert.equal(cleanupFinished, true);
  assert.equal(local.getItem("omlu:auth:tables"), null);
  assert.equal(getActiveWebTenantScope(), null);

  activateWebTenantScope(scopeB);
  assert.equal(getActiveWebTenantScope().restaurant_id, 20);
  assert.equal(calls.some(([kind]) => kind === "redirect"), false);
});

test("late A response and old epoch are rejected after authority generation changes", async () => {
  setupRuntime();
  activateWebTenantScope(scopeA);
  const generationA = getAuthorityGeneration();
  const fingerprintA = scopeFingerprint();

  await terminateWebAuthentication({ redirectTo: null });
  activateWebTenantScope(scopeB);

  assert.equal(isAuthorityGenerationCurrent(generationA, fingerprintA), false);
  assert.equal(
    isAuthorityGenerationCurrent(getAuthorityGeneration(), scopeFingerprint()),
    true,
  );
});

test("authentication-invalid 401 tears down while ordinary 403 preserves scope", async () => {
  const { calls } = setupRuntime();
  activateWebTenantScope(scopeA);
  assert.equal(handleAuthenticationStatus(403), false);
  assert.equal(getActiveWebTenantScope().actor_id, 100);
  assert.equal(calls.length, 0);

  assert.equal(handleAuthenticationStatus(401), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getActiveWebTenantScope(), null);
  assert.equal(calls.at(-1)[0], "redirect");
});

test("same runtime cannot activate B before A teardown", () => {
  setupRuntime();
  activateWebTenantScope(scopeA);
  assert.throws(
    () => activateWebTenantScope(scopeB),
    /Previous authority must be torn down/,
  );
});
