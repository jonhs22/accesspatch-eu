import type { Locator, Page } from "playwright";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";

export interface ArtifactPrivacy {
  redactedFormControlCount: number;
  formControlsRedacted: true;
}

function replaceBytes(
  input: Uint8Array,
  needle: Uint8Array,
  replacement: Uint8Array,
): Uint8Array {
  if (needle.length === 0 || input.length < needle.length) return input;
  const matches: number[] = [];
  for (let index = 0; index <= input.length - needle.length; index += 1) {
    let matchesNeedle = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (input[index + offset] !== needle[offset]) {
        matchesNeedle = false;
        break;
      }
    }
    if (matchesNeedle) {
      matches.push(index);
      index += needle.length - 1;
    }
  }
  if (matches.length === 0) return input;
  const outputLength =
    input.length + matches.length * (replacement.length - needle.length);
  const output = new Uint8Array(outputLength);
  let sourceOffset = 0;
  let outputOffset = 0;
  for (const match of matches) {
    output.set(input.subarray(sourceOffset, match), outputOffset);
    outputOffset += match - sourceOffset;
    output.set(replacement, outputOffset);
    outputOffset += replacement.length;
    sourceOffset = match + needle.length;
  }
  output.set(input.subarray(sourceOffset), outputOffset);
  return output;
}

export async function sanitizeTraceArchive(
  tracePath: string,
  sensitiveValues: string[],
): Promise<void> {
  const entries = unzipSync(new Uint8Array(await readFile(tracePath)));
  const encoder = new TextEncoder();
  const replacement = encoder.encode("[REDACTED_FORM_VALUE]");
  const tokens = [...new Set(sensitiveValues)]
    .filter((value) => value.length >= 3)
    .map((value) => encoder.encode(value));
  for (const [name, original] of Object.entries(entries)) {
    let sanitized = original;
    for (const token of tokens) {
      sanitized = replaceBytes(sanitized, token, replacement);
    }
    entries[name] = sanitized;
  }
  const temporaryPath = `${tracePath}.sanitized-${process.pid}`;
  try {
    await writeFile(temporaryPath, zipSync(entries, { level: 6 }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, tracePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
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
