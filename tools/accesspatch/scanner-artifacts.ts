import type { Locator, Page } from "playwright";

export interface ArtifactPrivacy {
  redactedFormControlCount: number;
  formControlsRedacted: true;
}

export async function scrubPageFormData(page: Page): Promise<ArtifactPrivacy> {
  const redactedFormControlCount = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("input, textarea, select")];
    for (const control of controls) {
      control.removeAttribute("value");
      if (control instanceof HTMLInputElement) {
        control.value = "";
        control.checked = false;
        control.removeAttribute("checked");
      } else if (control instanceof HTMLTextAreaElement) {
        control.value = "";
        control.textContent = "";
      } else if (control instanceof HTMLSelectElement) {
        for (const option of control.options) {
          option.selected = false;
          option.removeAttribute("selected");
          option.removeAttribute("value");
          option.value = "";
          option.textContent = "[redacted]";
        }
        control.selectedIndex = -1;
      }
    }
    return controls.length;
  });
  return {
    redactedFormControlCount,
    formControlsRedacted: true,
  };
}

export async function captureSanitizedDom(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, noscript").forEach((element) => element.remove());
    clone.querySelectorAll("input").forEach((element) => {
      element.removeAttribute("value");
      element.removeAttribute("checked");
    });
    clone.querySelectorAll("textarea").forEach((element) => {
      element.removeAttribute("value");
      element.textContent = "";
    });
    clone.querySelectorAll("select").forEach((element) => {
      element.removeAttribute("value");
      element.querySelectorAll("option").forEach((option) => {
        option.removeAttribute("selected");
        option.removeAttribute("value");
        option.textContent = "[redacted]";
      });
    });
    return `<!doctype html>\n${clone.outerHTML}\n`;
  });
}

export async function captureSanitizedOuterHtml(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.removeAttribute("value");
    clone.removeAttribute("checked");
    clone.removeAttribute("selected");
    if (clone instanceof HTMLTextAreaElement) clone.textContent = "";
    clone.querySelectorAll("input").forEach((control) => {
      control.removeAttribute("value");
      control.removeAttribute("checked");
    });
    clone.querySelectorAll("textarea").forEach((control) => {
      control.removeAttribute("value");
      control.textContent = "";
    });
    clone.querySelectorAll("option").forEach((option) => {
      option.removeAttribute("selected");
      option.removeAttribute("value");
      option.textContent = "[redacted]";
    });
    return clone.outerHTML;
  });
}
