const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");

module.exports = async ({ app, page, errors }) => {
  const pin = page.locator(".rh-chat .pinnedMessage");
  await expect(pin).toContainText("Fixture pinned notice");
  const tabs = await page.locator(".rh-chat-tabs").boundingBox();
  const gear = await page.getByRole("button", { name: "Chat settings", exact: true }).boundingBox();
  const pinButton = await page.getByRole("button", { name: "Pin Message", exact: true }).boundingBox();
  assert.equal(gear.width, 28);
  assert.equal(gear.height, 28);
  assert.equal(pinButton.height, gear.height);
  assert.equal(pinButton.y, gear.y);
  assert.equal(gear.x - pinButton.x - pinButton.width, 4);
  const pinBox = await pin.boundingBox();
  assert.ok(pinBox.y >= tabs.y + tabs.height && pinBox.y <= tabs.y + tabs.height + 9);
  // Pins occupy layout space; hiding a pin releases it rather than retaining an offset.
  const list = page.locator('[data-virtuoso-scroller="true"]').first();
  assert.ok((await list.boundingBox()).y >= pinBox.y + pinBox.height);
  await page.getByRole("button", { name: "Pin Message", exact: true }).click();
  await expect(pin).not.toBeVisible();
  assert.ok((await list.boundingBox()).y <= tabs.y + tabs.height + 9);
  await page.getByRole("button", { name: "Pin Message", exact: true }).click();
  await expect(pin).toBeVisible();
  await expect(page.getByText("A fixture chat message", { exact: true })).toBeVisible();

  await page
    .locator(".rh-chat .chatroomEmote")
    .filter({ has: page.locator('img[alt="TestSmile"]') })
    .hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("TestSmile");
  const bounds = await tooltip.boundingBox(),
    pane = await page.locator(".rh-chat").boundingBox();
  assert.ok(bounds.x >= pane.x && bounds.x + bounds.width <= pane.x + pane.width);
  assert.ok(bounds.y >= pane.y && bounds.y + bounds.height <= pane.y + pane.height);
  await page.screenshot({ path: ".cache/chat-tooltip.png" });
  await page.mouse.move(20, 20);

  const openProfile = async () => {
    const pending = app.waitForEvent("window");
    await page.locator(".rh-chat .chatMessageUsername").filter({ hasText: "FixtureViewer" }).first().click();
    const profile = await pending;
    profile.on("pageerror", (error) => errors.push(error.message));
    await expect(profile.getByRole("heading", { name: "FixtureViewer" })).toBeVisible();
    // Prevent unrelated desktop focus changes from exercising blur-to-dismiss.
    await profile.evaluate(() => window.app.userDialog.pin(true));
    return profile;
  };
  let profile = await openProfile();
  await expect(profile.getByRole("img", { name: "No profile picture" })).toBeVisible();
  await expect(profile.locator(".dialogHeaderUserDates")).toContainText("11 months");
  const inDisplay = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("user.html"));
    const box = win.getBounds(),
      area = screen.getDisplayMatching(box).workArea;
    return (
      box.x >= area.x &&
      box.y >= area.y &&
      box.x + box.width <= area.x + area.width &&
      box.y + box.height <= area.y + area.height
    );
  });
  assert.equal(inDisplay, true);
  await profile.screenshot({ path: ".cache/user-profile.png" });
  await profile.getByRole("button", { name: "Close user" }).click();
  await expect.poll(() => profile.isClosed()).toBe(true);

  await app.evaluate(() => {
    global.roundhouseTestProfileFailure = true;
  });
  profile = await openProfile();
  await expect(profile.getByRole("alert")).toContainText("Profile details could not be loaded");
  await app.evaluate(() => {
    global.roundhouseTestProfileFailure = false;
    global.roundhouseTestAvatar = "https://media.fixture/missing-avatar.png";
  });
  await profile.route("https://media.fixture/**", (route) => route.fulfill({ status: 404, body: "" }));
  await profile.getByRole("button", { name: "Retry" }).click();
  await expect(profile.getByRole("alert")).toHaveCount(0);
  await expect(profile.getByRole("img", { name: "No profile picture" })).toBeVisible();
  await profile.keyboard.press("Escape").catch((error) => {
    if (!profile.isClosed()) throw error;
  });
  await expect.poll(() => profile.isClosed()).toBe(true);

  // A fast second selection wins even while the first profile is loading.
  await app.evaluate(() => {
    global.roundhouseTestProfileDelay = true;
    global.roundhouseTestAvatar = null;
  });
  const pendingProfile = app.waitForEvent("window");
  await page.evaluate(async () => {
    const common = { chatroomId: 11, chatroomSlug: "test_live", cords: [innerWidth - 1, innerHeight - 1] };
    await window.app.userDialog.open({ ...common, sender: { id: 700, username: "EarlierViewer" } });
    await window.app.userDialog.open({ ...common, sender: { id: 701, username: "LatestViewer" } });
  });
  profile = await pendingProfile;
  await expect(profile.getByRole("heading", { name: "LatestViewer" })).toBeVisible();
  await profile.evaluate(() => window.app.userDialog.pin(true));
  await expect(profile.locator(".dialogHeaderUserDates")).toContainText("11 months");
  await profile.getByRole("button", { name: "Close user" }).click();
  await expect.poll(() => profile.isClosed()).toBe(true);

  const pendingSettings = app.waitForEvent("window");
  await page.getByRole("button", { name: "Chat settings", exact: true }).click();
  const settings = await pendingSettings;
  settings.on("pageerror", (error) => errors.push(error.message));
  await settings.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(settings.getByRole("heading", { name: "Chat filters" })).toBeVisible();
  await settings.getByRole("switch", { name: "Enable chat filters" }).click();
  await settings.getByRole("textbox", { name: "Add username" }).fill("@FixtureViewer");
  await settings.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("A fixture chat message", { exact: true })).toHaveCount(0);
  await expect(pin).toContainText("Fixture pinned notice");
  await settings.getByRole("combobox", { name: "Filtered messages" }).selectOption("highlight");
  await expect(page.locator('.rh-filtered-message[data-filter-reason="user"]')).toHaveCount(2);
  await expect(settings.getByRole("switch", { name: "Enable chat filters" })).toBeChecked();
  await settings.screenshot({ path: ".cache/chat-filters.png", animations: "disabled" });
  await settings.getByRole("button", { name: "Remove fixtureviewer" }).click();
  await settings.getByRole("tab", { name: "Users & repeats" }).focus();
  await settings.keyboard.press("End");
  await expect(settings.getByRole("tab", { name: "Text rules" })).toBeFocused();
  await settings.getByRole("switch", { name: "Enable text rules" }).click();
  await settings.getByRole("button", { name: "Add text rule" }).click();
  await settings.getByRole("textbox", { name: "Rule 1 pattern" }).fill("(fixture)");
  await settings.getByRole("combobox", { name: "Rule 1 action" }).selectOption("replace");
  await settings.getByRole("textbox", { name: "Rule 1 replacement" }).fill("$1 filtered");
  await settings.getByRole("textbox", { name: "Test a message" }).fill("A fixture chat message");
  await expect(settings.getByRole("status")).toContainText("Result: A fixture filtered chat message");
  await expect(page.getByText("A fixture filtered chat message", { exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Add text rule" }).scrollIntoViewIfNeeded();
  await settings.screenshot({ path: ".cache/chat-text-rules.png", animations: "disabled" });
  await settings.getByRole("textbox", { name: "Rule 1 pattern" }).fill("[");
  await expect(settings.getByRole("alert")).toBeVisible();
  await expect(page.getByText("A fixture chat message", { exact: true })).toBeVisible();
  await settings.getByRole("switch", { name: "Enable chat filters" }).click();
  await expect.poll(() => page.evaluate(async () => (await window.app.store.get()).chatFilters.enabled)).toBe(false);
  await settings.close();
  const reopening = app.waitForEvent("window");
  await page.getByRole("button", { name: "Chat settings", exact: true }).click();
  const restored = await reopening;
  await restored.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(restored.getByRole("heading", { name: "Chat filters" })).toBeVisible();
  await expect(restored.getByRole("switch", { name: "Enable chat filters" })).not.toBeChecked();
  await restored.getByRole("tab", { name: "Text rules" }).click();
  await expect(restored.getByRole("textbox", { name: "Rule 1 pattern" })).toHaveValue("[");
  await restored.close();
  console.log(
    "PASS: pin flow/collapse, bounded emote tooltip, profile fallback/retry/close/Escape/latest selection, filter settings and live hide/highlight/replacement preview.",
  );
};
