const { test, expect } = require("@playwright/test");

const widths = [320, 360, 375, 390, 430, 768, 834, 1024, 1280, 1440, 1920];

for (const width of widths) {
  test(`pillars layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("http://127.0.0.1:4173/index.html");
    await page.locator(".pillars-section").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector(".pillars-section").classList.add("active"));

    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      const grid = document.querySelector(".pillars");
      const pillars = [...document.querySelectorAll(".pillar")];
      const titles = [...document.querySelectorAll(".pillar-title")];
      const numbers = [...document.querySelectorAll(".pillar-number")];
      const gridStyles = getComputedStyle(grid);
      const gridRect = grid.getBoundingClientRect();
      const pillarRects = pillars.map((item) => item.getBoundingClientRect());
      const titleRects = titles.map((item) => item.getBoundingClientRect());
      const numberRects = numbers.map((item) => item.getBoundingClientRect());
      const overlaps = pillarRects.some((rect, index) => {
        const next = pillarRects[index + 1];
        return next && rect.right > next.left + 0.5 && Math.abs(rect.top - next.top) < 8;
      });
      const titleOverflow = titles.some((title, index) => {
        const rect = titleRects[index];
        const parent = pillars[index].getBoundingClientRect();
        return rect.left < parent.left - 0.5 || rect.right > parent.right + 0.5;
      });

      return {
        bodyOverflow: doc.scrollWidth > window.innerWidth,
        columns: gridStyles.gridTemplateColumns.split(" ").length,
        gridLeft: gridRect.left,
        gridRight: gridRect.right,
        overlaps,
        titleOverflow,
        equalDesktopColumns: pillarRects.every((rect) => Math.abs(rect.width - pillarRects[0].width) < 1),
        numberBaseline: numberRects.every((rect) => Math.abs(rect.top - numberRects[0].top) < 1),
        titleBaseline: titleRects.every((rect) => Math.abs(rect.top - titleRects[0].top) < 1),
      };
    });

    expect(result.bodyOverflow).toBe(false);
    expect(result.overlaps).toBe(false);
    expect(result.titleOverflow).toBe(false);

    if (width <= 768) {
      expect(result.columns).toBe(1);
    } else if (width <= 1100) {
      expect(result.columns).toBe(3);
    } else {
      expect(result.columns).toBe(5);
      expect(result.equalDesktopColumns).toBe(true);
      expect(result.numberBaseline).toBe(true);
      expect(result.titleBaseline).toBe(true);
    }
  });
}
