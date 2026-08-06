import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notFound = read("app/not-found.tsx");
const errorBoundary = read("app/error.tsx");
const globalError = read("app/global-error.tsx");

test("not-found.tsx renders friendly 404 navigation without technical stack traces", () => {
  assert.match(notFound, /Page Not Found/);
  assert.match(notFound, /href="\/"/);
  assert.match(notFound, /href="\/staff"/);
  assert.doesNotMatch(notFound, /error\.stack|stackTrace|Exception/);
});

test("error.tsx presents retry action and safe navigation without stack trace exposure", () => {
  assert.match(errorBoundary, /Something went wrong/);
  assert.match(errorBoundary, /reset\(\)/);
  assert.match(errorBoundary, /Reference Code:/);
  assert.doesNotMatch(errorBoundary, /error\.stack|stackTrace/);
});

test("global-error.tsx encapsulates html and body tags with reload action", () => {
  assert.match(globalError, /<html/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /Reload Application/);
  assert.match(globalError, /reset\(\)/);
});
