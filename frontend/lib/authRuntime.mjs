const AUTH_STORAGE_PREFIXES = [
  "omlu:auth:",
  "omlu:return:",
  "staff-order-cart",
];

let activeScope = null;
let authorityGeneration = 0;
let phase = "anonymous";
let teardownPromise = null;
const cleanupCallbacks = new Set();

let runtime = {
  fetch: (...args) => globalThis.fetch(...args),
  redirect: (path) => globalThis.location?.replace(path),
  localStorage: () => globalThis.localStorage,
  sessionStorage: () => globalThis.sessionStorage,
};

function assertInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid web tenant scope ${field}.`);
  }
}

export function normalizeWebTenantScope(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Authenticated response is missing web tenant scope.");
  }
  assertInteger(value.restaurant_id, "restaurant_id");
  assertInteger(value.actor_id, "actor_id");
  if (typeof value.role !== "string" || !value.role) {
    throw new Error("Invalid web tenant scope role.");
  }
  if (
    typeof value.authority_epoch !== "string" ||
    !value.authority_epoch.startsWith("v1.")
  ) {
    throw new Error("Invalid web tenant authority epoch.");
  }
  return Object.freeze({
    restaurant_id: value.restaurant_id,
    actor_id: value.actor_id,
    role: value.role,
    authority_epoch: value.authority_epoch,
  });
}

export function scopeFingerprint(scope = activeScope) {
  if (!scope) return null;
  return [
    scope.restaurant_id,
    scope.actor_id,
    scope.role,
    scope.authority_epoch,
  ].join("|");
}

export function activateWebTenantScope(value) {
  const next = normalizeWebTenantScope(value);
  const currentFingerprint = scopeFingerprint();
  const nextFingerprint = scopeFingerprint(next);
  if (phase === "terminating") {
    throw new Error("Authentication teardown is still in progress.");
  }
  if (currentFingerprint && currentFingerprint !== nextFingerprint) {
    throw new Error("Previous authority must be torn down before account switch.");
  }
  if (!currentFingerprint) authorityGeneration += 1;
  activeScope = next;
  phase = "active";
  return next;
}

export function getActiveWebTenantScope() {
  return activeScope;
}

export function getAuthorityGeneration() {
  return authorityGeneration;
}

export function isAuthorityGenerationCurrent(generation, fingerprint) {
  return (
    phase === "active" &&
    generation === authorityGeneration &&
    fingerprint === scopeFingerprint()
  );
}

function stableValue(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`)
    .join(",")}}`;
}

export function authenticatedCacheKey(feature, filters = null) {
  if (!activeScope || phase !== "active") {
    throw new Error("Authenticated cache key requested without active scope.");
  }
  return [
    "auth",
    `restaurant=${activeScope.restaurant_id}`,
    `actor=${activeScope.actor_id}`,
    `role=${encodeURIComponent(activeScope.role)}`,
    `epoch=${encodeURIComponent(activeScope.authority_epoch)}`,
    `feature=${encodeURIComponent(feature)}`,
    `filters=${encodeURIComponent(stableValue(filters))}`,
  ].join(":");
}

export function registerAuthenticatedCleanup(callback) {
  cleanupCallbacks.add(callback);
  return () => cleanupCallbacks.delete(callback);
}

function purgeStorage(storage) {
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && AUTH_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
}

export async function terminateWebAuthentication({
  reason = "authentication_terminated",
  clearServerSession = true,
  redirectTo = "/login",
} = {}) {
  if (teardownPromise) return teardownPromise;
  phase = "terminating";
  authorityGeneration += 1;
  const callbacks = [...cleanupCallbacks];

  teardownPromise = (async () => {
    await Promise.allSettled(callbacks.map((callback) => callback(reason)));
    purgeStorage(runtime.localStorage());
    purgeStorage(runtime.sessionStorage());
    if (clearServerSession) {
      try {
        await runtime.fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // Local authority still terminates; the server route clears its cookie
        // whenever it is reachable.
      }
    }
    activeScope = null;
    phase = "anonymous";
    const destination = redirectTo;
    teardownPromise = null;
    if (destination) runtime.redirect(destination);
  })();
  return teardownPromise;
}

export async function prepareForAuthentication() {
  await terminateWebAuthentication({
    reason: "account_switch_or_login",
    clearServerSession: true,
    redirectTo: null,
  });
}

export function handleAuthenticationStatus(status) {
  if (status === 401 && activeScope) {
    void terminateWebAuthentication({
      reason: "http_401",
      clearServerSession: true,
      redirectTo: "/login",
    });
    return true;
  }
  return false;
}

export function configureAuthRuntimeForTests(overrides) {
  runtime = { ...runtime, ...overrides };
}

export function resetAuthRuntimeForTests() {
  activeScope = null;
  authorityGeneration = 0;
  phase = "anonymous";
  teardownPromise = null;
  cleanupCallbacks.clear();
}
