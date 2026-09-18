const { expect } = require("@playwright/test");

module.exports = async ({ app, page, getSocket, hoverEdge, errors }) => {
  const saved = await page.evaluate(() => window.app.store.get("chatFilters"));
  const rules = [{ pattern: "^(.{4,}?)(?:\\s*\\1)+$", flags: "iu", action: "replace", replacement: "$1" }];
  const send = (id, content) =>
    getSocket().send(
      JSON.stringify({
        event: "App\\Events\\ChatMessageEvent",
        channel: "chatrooms.11.v2",
        data: JSON.stringify({
          id,
          chatroom_id: 11,
          type: "message",
          content,
          created_at: new Date().toISOString(),
          sender: { id: 990, username: "FreezeFixture", identity: { color: "#53fc18", badges: [] } },
        }),
      }),
    );
  let settings;
  try {
    await page.evaluate(
      (regexRules) =>
        window.app.store.set("chatFilters", { enabled: true, duplicateEnabled: false, regexEnabled: true, regexRules }),
      rules,
    );
    await hoverEdge("bottom");
    send("freeze-trigger", "[emote:1:TestSmile]".repeat(12) + " WEEE WONNNN");
    // These controls go through the renderer, which used to be blocked completely.
    await page.getByRole("button", { name: "Mute", exact: true }).click({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Unmute", exact: true }).click();
    await expect(page.locator(".rh-filter-warning")).toContainText("Text rule 1 took too long", { timeout: 10000 });
    send("freeze-after", "Still receiving chat after the slow rule");
    await expect(page.getByText("Still receiving chat after the slow rule", { exact: true })).toBeInViewport();
    await page.screenshot({ path: ".cache/chat-freeze-recovered.png" });
    const opening = app.waitForEvent("window");
    await page.getByRole("button", { name: "Chat settings", exact: true }).click();
    settings = await opening;
    settings.on("pageerror", (error) => errors.push(error.message));
    await settings.getByRole("button", { name: "Filters", exact: true }).click();
    await settings.getByRole("tab", { name: "Text rules" }).click();
    await settings.getByRole("textbox", { name: "Test a message" }).fill(" ".repeat(175) + "WEEE WONNNN");
    await expect(settings.getByRole("alert")).toContainText("Took too long", { timeout: 10000 });
    await settings.getByRole("textbox", { name: "Rule 1 pattern" }).fill("hello");
    await settings.getByRole("textbox", { name: "Test a message" }).fill("hello");
    await expect(settings.getByRole("status")).toContainText("Result:");
    await expect(page.locator(".rh-filter-warning")).toHaveCount(0);
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect.poll(() => settings.isClosed()).toBe(true);
    console.log(
      "PASS: catastrophic live text rule and settings preview time out; mute, chat, edits and close remain responsive.",
    );
  } finally {
    if (settings && !settings.isClosed()) await settings.close();
    await page.evaluate((value) => window.app.store.set("chatFilters", value), saved);
  }
};
