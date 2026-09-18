const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");

module.exports = async ({ page, getSocket }) => {
  const { DEFAULTS } = await import("../utils/chat-filters.mjs");
  const saved = await page.evaluate(() => window.app.store.get("chatFilters"));
  const list = page.locator('.rh-chat [data-virtuoso-scroller="true"]').first();
  const gap = () => list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  let sequence = 0;
  const batch = (count, hidden = false) => {
    let last;
    for (let i = 0; i < count; i++) {
      const id = ++sequence;
      const blocked = hidden && i !== count - 1 && i % 3 !== 0;
      last = `Scroll fixture ${id}`;
      getSocket().send(
        JSON.stringify({
          event: "App\\Events\\ChatMessageEvent",
          channel: "chatrooms.11.v2",
          data: JSON.stringify({
            id: `scroll-${id}`,
            chatroom_id: 11,
            type: "message",
            created_at: new Date().toISOString(),
            content: last + (id % 4 === 0 ? " long wrapped message".repeat(10) : " [emote:1:TestSmile]"),
            sender: {
              id: blocked ? 901 : 902,
              username: blocked ? "HiddenFixture" : "ScrollFixture",
              identity: { color: "#53fc18", badges: [] },
            },
          }),
        }),
      );
    }
    return last;
  };
  const pinned = async (last) => {
    await expect(page.locator(".rh-chat .chatMessageItem").filter({ hasText: last })).toBeInViewport({
      ratio: 0.95,
      timeout: 10000,
    });
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Scroll To Bottom", exact: true })).toHaveCount(0);
  };
  try {
    await page.evaluate((settings) => window.app.store.set("chatFilters", settings), { ...DEFAULTS, enabled: false });
    for (let i = 0; i < 7; i++) await pinned(batch(55));
    await page.evaluate((settings) => window.app.store.set("chatFilters", settings), {
      ...DEFAULTS,
      enabled: true,
      blockedUsers: ["HiddenFixture"],
    });
    for (let i = 0; i < 7; i++) await pinned(batch(55, true));
    // A row growing after emote decoding and a shrinking viewport must stay live.
    await list
      .locator("[data-item-index]")
      .last()
      .evaluate((el) => {
        el.style.minHeight = "240px";
      });
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Pin Message", exact: true }).click();
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Pin Message", exact: true }).click();
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await list.hover();
    await page.mouse.wheel(0, -400);
    const resume = page.getByRole("button", { name: "Scroll To Bottom", exact: true });
    await expect(resume).toBeVisible();
    const readingTop = await list.evaluate((el) => el.scrollTop);
    const readingHeight = await list.evaluate((el) => el.scrollHeight);
    const last = batch(30, true);
    await expect.poll(() => list.evaluate((el) => el.scrollHeight)).toBeGreaterThan(readingHeight + 100);
    await expect.poll(gap).toBeGreaterThan(100);
    assert.ok(
      Math.abs((await list.evaluate((el) => el.scrollTop)) - readingTop) < 10,
      "new arrivals must not pull a reader down",
    );
    await resume.click();
    await pinned(last);
    await list.focus();
    await page.keyboard.press("PageUp");
    await expect(resume).toBeVisible();
    await page.keyboard.press("End");
    await pinned(last);
    const box = await list.boundingBox();
    const gutter = await list.evaluate((el) => el.offsetWidth - el.clientWidth);
    assert.ok(gutter > 0, "fixture exposes the native scrollbar");
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + box.height - 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(resume).toBeVisible();
    await expect.poll(gap).toBeGreaterThan(100);
    await resume.click();
    await pinned(last);
    await page.screenshot({ path: ".cache/chat-follow.png" });
    console.log(
      "PASS: 800 mixed-height messages, rolling retention, filters, late row resize, pin layout, scroll-up reading and resume.",
    );
  } finally {
    await page.evaluate((settings) => window.app.store.set("chatFilters", settings), saved);
  }
};
