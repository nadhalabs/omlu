import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.name === "node_modules" || entry.name === ".next" ? [] : entry.isDirectory() ? sourceFiles(path.join(directory, entry.name)) : /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}

test("frontend contains no browser-native alert, confirm, or prompt calls", () => {
  const nativeDialog = /(?:window|globalThis|self)\.(?:alert|confirm|prompt)\s*\(|(?:^|[^A-Za-z])(?:alert|confirm|prompt)\s*\(/m;
  const matches = sourceFiles(root).filter((file) => nativeDialog.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(matches, []);
});

test("shared OMLU dialogs provide modal accessibility and focus protections", () => {
  const source = fs.readFileSync(path.join(root, "components/OmluUiProvider.tsx"), "utf8");
  for (const contract of ["OmluConfirmDialog", 'role="dialog"', 'aria-modal="true"', "event.key === \"Escape\"", "document.body.style.overflow", "previous.current?.focus()", "disabled={busy}", 'role="alert"', 'aria-live="polite"']) assert.ok(source.includes(contract), contract);
});
