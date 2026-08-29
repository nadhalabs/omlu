import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("browser session renewal keeps secure cookie protections", () => {
  const login = read("app/api/auth/login/route.ts");
  const me = read("app/api/auth/me/route.ts");
  for (const source of [login, me]) {
    assert.match(source, /httpOnly:\s*true/);
    assert.match(source, /secure:\s*process\.env\.NODE_ENV === "production"/);
    assert.match(source, /sameSite:\s*"lax"/);
    assert.match(source, /maxAge:/);
  }
  assert.match(me, /renewedToken/);
});

test("active browser scope refreshes from server without treating outages as logout", () => {
  const scope = read("components/WebAuthScope.tsx");
  assert.match(scope, /getStaffMe\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(scope, /document\.visibilityState === "visible"/);
  assert.match(scope, /12 \* 60 \* 60 \* 1000/);
});
