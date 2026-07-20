import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const workspace = path.resolve(root, "..");
const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const flutterColors = fs.readFileSync(
  path.join(workspace, "mobile-app/omlu_operations/lib/design_system/colors.dart"),
  "utf8",
);

test("web exposes the neutral and orange OMLU theme tokens", () => {
  for (const token of [
    "--omlu-background: #f7f7f5",
    "--omlu-primary: #18181b",
    "--omlu-accent: #f97316",
    "--omlu-accent-dark: #ea580c",
    "--omlu-accent-soft: #fff1e6",
    "--omlu-surface: #ffffff",
    "--omlu-border: #e4e4e7",
  ]) assert.match(globals, new RegExp(token.replaceAll("-", "\\-")));
  assert.doesNotMatch(globals, /prefers-color-scheme:\s*dark/);
});

test("Flutter uses the same neutral and orange identity", () => {
  for (const color of ["0xFFF7F7F5", "0xFF18181B", "0xFFF97316", "0xFFEA580C", "0xFFFFF1E6"]) {
    assert.match(flutterColors, new RegExp(color));
  }
  assert.doesNotMatch(flutterColors, /0xFFE91E63|0xFFC2185B|0xFFFFF2F2/);
});
