import { expect, test } from "@playwright/test";
import {
  captureSanitizedDom,
  scrubPageFormData,
} from "../../tools/accesspatch/scanner-artifacts.js";

test("artifact preparation scrubs input, textarea, and selected option data", async ({ page }) => {
  await page.setContent(`
    <form>
      <input id="private-input" value="PRIVATE-INPUT-VALUE">
      <textarea id="private-textarea">PRIVATE-TEXTAREA-VALUE</textarea>
      <select id="private-select">
        <option value="PRIVATE-OPTION-VALUE" selected>PRIVATE-OPTION-LABEL</option>
      </select>
    </form>
  `);

  const privacy = await scrubPageFormData(page);
  expect(privacy).toEqual({
    redactedFormControlCount: 3,
    formControlsRedacted: true,
  });
  expect(await page.locator("#private-input").inputValue()).toBe("");
  expect(await page.locator("#private-textarea").inputValue()).toBe("");
  expect(await page.locator("#private-select").inputValue()).toBe("");

  const dom = await captureSanitizedDom(page);
  for (const secret of [
    "PRIVATE-INPUT-VALUE",
    "PRIVATE-TEXTAREA-VALUE",
    "PRIVATE-OPTION-VALUE",
    "PRIVATE-OPTION-LABEL",
  ]) {
    expect(dom).not.toContain(secret);
  }
  expect(dom).not.toMatch(/\sselected(?:=|>|\s)/i);
});
