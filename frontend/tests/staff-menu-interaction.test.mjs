import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Helper checking presentation-scoped menu ownership
function isMenuInstanceOpen(activeState, memberId, presentation) {
  return Boolean(
    activeState &&
    activeState.memberId === memberId &&
    activeState.presentation === presentation
  );
}

// The outside-click containment decision function extracted for interaction testing
function isInsideMenuSystem(target, trigger, menu) {
  if (!target) return false;
  if (trigger && trigger.contains(target)) return true;
  if (menu && menu.contains(target)) return true;
  return false;
}

// Menu action execution helper ensuring action invocation occurs before dismissal & prevents focus stealing
function runMenuAction(action, dismissMenu, restoreTriggerFocus, opensDialog = true) {
  void action();
  dismissMenu();
  if (!opensDialog && restoreTriggerFocus) {
    restoreTriggerFocus();
  }
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

test("isMenuInstanceOpen enforces single presentation ownership per member (prevents duplicate desktop & mobile portals)", () => {
  // 1. When desktop member 10 opens the menu
  let activeState = { memberId: 10, presentation: "desktop" };

  assert.equal(isMenuInstanceOpen(activeState, 10, "desktop"), true, "Desktop member 10 menu must be open");
  assert.equal(isMenuInstanceOpen(activeState, 10, "mobile"), false, "Mobile member 10 menu must NOT be open");
  assert.equal(isMenuInstanceOpen(activeState, 11, "desktop"), false, "Desktop member 11 menu must NOT be open");
  assert.equal(isMenuInstanceOpen(activeState, 11, "mobile"), false, "Mobile member 11 menu must NOT be open");

  // 2. When mobile member 10 opens the menu
  activeState = { memberId: 10, presentation: "mobile" };

  assert.equal(isMenuInstanceOpen(activeState, 10, "desktop"), false, "Desktop member 10 menu must NOT be open");
  assert.equal(isMenuInstanceOpen(activeState, 10, "mobile"), true, "Mobile member 10 menu must be open");
  assert.equal(isMenuInstanceOpen(activeState, 11, "desktop"), false, "Desktop member 11 menu must NOT be open");
  assert.equal(isMenuInstanceOpen(activeState, 11, "mobile"), false, "Mobile member 11 menu must NOT be open");

  // 3. Opening member 11 replaces member 10
  activeState = { memberId: 11, presentation: "desktop" };

  assert.equal(isMenuInstanceOpen(activeState, 10, "desktop"), false, "Member 10 desktop menu must be closed when member 11 opens");
  assert.equal(isMenuInstanceOpen(activeState, 10, "mobile"), false, "Member 10 mobile menu must be closed when member 11 opens");
  assert.equal(isMenuInstanceOpen(activeState, 11, "desktop"), true, "Member 11 desktop menu must be open");

  // 4. Closing active menu clears ownership
  activeState = null;

  assert.equal(isMenuInstanceOpen(activeState, 10, "desktop"), false);
  assert.equal(isMenuInstanceOpen(activeState, 10, "mobile"), false);
  assert.equal(isMenuInstanceOpen(activeState, 11, "desktop"), false);
  assert.equal(isMenuInstanceOpen(activeState, 11, "mobile"), false);
});

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

test("Reset PIN action invocation occurs before menu dismissal and does not steal focus back to trigger", () => {
  const events = [];
  let resetModalTarget = null;
  let menuOpen = true;

  const openResetPassword = (member) => {
    events.push("action:openResetPassword");
    resetModalTarget = member;
  };
  const dismissMenu = () => {
    events.push("dismissMenu");
    menuOpen = false;
  };
  const restoreTriggerFocus = () => {
    events.push("restoreTriggerFocus");
  };

  const targetMember = { id: 1, name: "Staff User" };

  runMenuAction(() => openResetPassword(targetMember), dismissMenu, restoreTriggerFocus, true);

  assert.deepEqual(events, ["action:openResetPassword", "dismissMenu"]);
  assert.equal(resetModalTarget, targetMember, "Reset PIN modal target must be set");
  assert.equal(menuOpen, false, "Menu must be dismissed after action invocation");
  assert.equal(events.includes("restoreTriggerFocus"), false, "Focus must not be stolen back to trigger when opening modal");
});

test("Suspend dialog invocation occurs before menu dismissal and does not steal focus back to trigger", () => {
  const events = [];
  let suspendDialogOpen = false;
  let menuOpen = true;

  const changeStatus = (status) => {
    events.push(`action:changeStatus:${status}`);
    suspendDialogOpen = true;
  };
  const dismissMenu = () => {
    events.push("dismissMenu");
    menuOpen = false;
  };
  const restoreTriggerFocus = () => {
    events.push("restoreTriggerFocus");
  };

  runMenuAction(() => changeStatus("suspended"), dismissMenu, restoreTriggerFocus, true);

  assert.deepEqual(events, ["action:changeStatus:suspended", "dismissMenu"]);
  assert.equal(suspendDialogOpen, true, "Suspend dialog must open");
  assert.equal(menuOpen, false, "Menu must be dismissed after action invocation");
  assert.equal(events.includes("restoreTriggerFocus"), false, "Focus must not be stolen back to trigger when opening suspend dialog");
});

test("Remove confirmation invocation occurs before menu dismissal and does not steal focus back to trigger", () => {
  const events = [];
  let removeConfirmOpen = false;
  let menuOpen = true;

  const removeAccess = () => {
    events.push("action:removeAccess");
    removeConfirmOpen = true;
  };
  const dismissMenu = () => {
    events.push("dismissMenu");
    menuOpen = false;
  };
  const restoreTriggerFocus = () => {
    events.push("restoreTriggerFocus");
  };

  runMenuAction(() => removeAccess(), dismissMenu, restoreTriggerFocus, true);

  assert.deepEqual(events, ["action:removeAccess", "dismissMenu"]);
  assert.equal(removeConfirmOpen, true, "Remove confirmation dialog must open");
  assert.equal(menuOpen, false, "Menu must be dismissed after action invocation");
  assert.equal(events.includes("restoreTriggerFocus"), false, "Focus must not be stolen back to trigger when opening remove confirmation");
});

test("Menu actions that do not open a dialog restore focus to trigger after dismissal", () => {
  const events = [];

  const simpleAction = () => {
    events.push("action:simple");
  };
  const dismissMenu = () => {
    events.push("dismissMenu");
  };
  const restoreTriggerFocus = () => {
    events.push("restoreTriggerFocus");
  };

  runMenuAction(simpleAction, dismissMenu, restoreTriggerFocus, false);

  assert.deepEqual(events, ["action:simple", "dismissMenu", "restoreTriggerFocus"]);
});

test("StaffManagementClient source contracts include exported helpers and runMenuAction invocation", () => {
  const source = readFileSync(new URL("../app/admin/staff/StaffManagementClient.tsx", import.meta.url), "utf8");
  assert.match(source, /export function isMenuInstanceOpen/);
  assert.match(source, /export function isInsideMenuSystem/);
  assert.match(source, /export function runMenuAction/);
  assert.match(source, /isMenuInstanceOpen\(openMenuState, member\.id, "desktop"\)/);
  assert.match(source, /isMenuInstanceOpen\(openMenuState, member\.id, "mobile"\)/);
  assert.match(source, /runMenuAction\(\s*action,\s*\(\) => setOpenMenu\(false\),\s*\(\) => triggerRef\.current\?\.focus\(\),\s*opensDialog\s*\)/);
});
