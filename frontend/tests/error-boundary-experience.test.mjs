import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notFound = read("app/not-found.tsx");
const errorBoundary = read("app/error.tsx");
const globalError = read("app/global-error.tsx");

test("404 renders the supplied chef artwork without distortion", () => {
  assert.match(notFound, /src="\/images\/omlu-404-chef\.png"/);
  assert.match(notFound, /alt="OMLU chef beside a 404 not found sign"/);
  assert.match(notFound, /width=\{1536\}/);
  assert.match(notFound, /height=\{1024\}/);
  assert.match(notFound, /h-auto[^"]*w-full[^"]*object-contain/);
});

test("anonymous recovery exposes only public destinations", () => {
  assert.match(notFound, /primary: \{ href: "\/", label: "Go to Home" \}/);
  assert.match(notFound, /secondary: \{ href: "\/login", label: "Sign In" \}/);
});

test("owner and admin recover through the canonical role home", () => {
  assert.match(notFound, /staff\.role === "owner" \|\| staff\.role === "admin"/);
  assert.match(notFound, /primary: \{ href: roleHomePath\(staff\), label: "Go to Dashboard" \}/);
});

test("staff and kitchen receive scoped canonical recovery destinations", () => {
  assert.match(notFound, /staff\.role === "staff"/);
  assert.match(notFound, /label: "Go to Tables"/);
  assert.match(notFound, /staff\.role === "kitchen" && staff\.restaurant_slug/);
  assert.match(notFound, /label: "Open Kitchen Display"/);
});

test("failed or incomplete authority falls back to anonymous recovery", () => {
  assert.match(notFound, /getStaffMe\(\)/);
  assert.match(notFound, /\.catch\(\(\) =>/);
  assert.match(notFound, /if \(active\) setStaff\(null\)/);
  assert.match(notFound, /if \(staff\.role === "kitchen" && staff\.restaurant_slug\)/);
});

test("Go Back avoids self-loops and falls back to the resolved role home", () => {
  assert.match(notFound, /previous\.pathname !== window\.location\.pathname/);
  assert.match(notFound, /router\.back\(\)/);
  assert.match(notFound, /router\.replace\(recovery\.primary\.href\)/);
});

test("404 remains compact, responsive, theme-aware, and free of universal feature cards", () => {
  assert.match(notFound, /overflow-x-hidden/);
  assert.match(notFound, /grid[^"]*lg:grid-cols/);
  assert.match(notFound, /sm:w-auto/);
  assert.match(notFound, /var\(--omlu-page-background\)/);
  assert.match(notFound, /PublicThemeControl/);
  assert.doesNotMatch(notFound, /Where would you like to go|Orders|Reports|Settings/);
  assert.doesNotMatch(notFound, /href="\/admin\/dashboard"/);
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
