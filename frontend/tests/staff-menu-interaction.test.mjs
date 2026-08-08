import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The outside-click containment decision function extracted for interaction testing
function isInsideMenuSystem(target, trigger, menu) {
  if (!target) return false;
  if (trigger && trigger.contains(target)) return true;
  if (menu && menu.contains(target)) return true;
  return false;
}

// Helper mock node builder for testing containment behavior without requiring full DOM
function createMockNode(name = "node", parent = null) {
  const children = new Set();
  const node = {
    name,
    parent,
    contains(target) {
      if (!target) return false;
      if (target === node) return true;
      for (const child of children) {
        if (child.contains(target)) return true;
      }
      return false;
    },
    appendChild(child) {
      children.add(child);
      child.parent = node;
      return child;
    },
  };
  return node;
}

test("isInsideMenuSystem correctly identifies trigger target as inside (stays open)", () => {
  const trigger = createMockNode("trigger");
  const triggerIcon = createMockNode("triggerIcon", trigger);
  trigger.appendChild(triggerIcon);
  const menu = createMockNode("portaledMenu");

  assert.equal(isInsideMenuSystem(trigger, trigger, menu), true);
  assert.equal(isInsideMenuSystem(triggerIcon, trigger, menu), true);
});

test("isInsideMenuSystem correctly identifies portaled menu item target as inside (stays open long enough for action)", () => {
  const trigger = createMockNode("trigger");
  const menu = createMockNode("portaledMenu");
  const menuItemResetPin = createMockNode("resetPinItem", menu);
  const menuItemSuspend = createMockNode("suspendItem", menu);
  const menuItemRemove = createMockNode("removeItem", menu);
  menu.appendChild(menuItemResetPin);
  menu.appendChild(menuItemSuspend);
  menu.appendChild(menuItemRemove);

  // Clicks inside the portaled menu (such as Reset PIN, Suspend, or Remove) must evaluate as inside
  assert.equal(isInsideMenuSystem(menu, trigger, menu), true);
  assert.equal(isInsideMenuSystem(menuItemResetPin, trigger, menu), true);
  assert.equal(isInsideMenuSystem(menuItemSuspend, trigger, menu), true);
  assert.equal(isInsideMenuSystem(menuItemRemove, trigger, menu), true);
});

test("isInsideMenuSystem correctly identifies true outside target as outside (closes menu)", () => {
  const trigger = createMockNode("trigger");
  const menu = createMockNode("portaledMenu");
  const outsidePageContainer = createMockNode("pageContainer");
  const outsideButton = createMockNode("outsideButton", outsidePageContainer);
  outsidePageContainer.appendChild(outsideButton);

  assert.equal(isInsideMenuSystem(outsidePageContainer, trigger, menu), false);
  assert.equal(isInsideMenuSystem(outsideButton, trigger, menu), false);
  assert.equal(isInsideMenuSystem(null, trigger, menu), false);
});

test("simulated mousedown event handling protects action execution from early unmount regression", () => {
  let menuOpen = true;
  let actionExecuted = false;

  const trigger = createMockNode("trigger");
  const menu = createMockNode("portaledMenu");
  const menuItemResetPin = createMockNode("resetPinItem", menu);
  menu.appendChild(menuItemResetPin);

  const resetPinAction = () => {
    actionExecuted = true;
  };

  // Simulate mousedown event listener behavior on document
  const handleMousedown = (eventTarget) => {
    if (!isInsideMenuSystem(eventTarget, trigger, menu)) {
      menuOpen = false;
    }
  };

  // 1. User presses mousedown on "Reset PIN" inside portaled menu
  handleMousedown(menuItemResetPin);

  // 2. Menu must NOT unmount on mousedown
  assert.equal(menuOpen, true, "Menu must remain mounted on mousedown over menu item");

  // 3. User releases mouse (click event fires) and executes Reset PIN action
  if (menuOpen) {
    resetPinAction();
    menuOpen = false; // Close after action runs
  }

  assert.equal(actionExecuted, true, "Reset PIN action must execute successfully");
  assert.equal(menuOpen, false, "Menu closes after action execution");
});

test("StaffManagementClient source contracts include exported containment helper and menuRef attachment", () => {
  const source = readFileSync(new URL("../app/admin/staff/StaffManagementClient.tsx", import.meta.url), "utf8");
  assert.match(source, /export function isInsideMenuSystem/);
  assert.match(source, /isInsideMenuSystem\(event\.target as Node, triggerRef\.current, menuRef\.current\)/);
  assert.match(source, /<ActionMenuPopover triggerRect=\{triggerRect\} menuRef=\{menuRef\}>/);
});
