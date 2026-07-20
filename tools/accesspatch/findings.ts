import type { Finding } from "../../src/contracts/run.js";

export interface FindingEvidenceInput {
  axeButtonUnnamed: boolean;
  repeatedFocusTargets: string[];
  visibleErrorIsLive: boolean;
  sourceMarkers: string[];
  evidencePaths: {
    axe: string;
    aria: string;
    keyboard: string;
  };
  htmlExcerpts?: Partial<Record<"payment" | "email" | "error", string>>;
}

export function buildFindings(input: FindingEvidenceInput): Finding[] {
  const sourceMarkers = new Set(input.sourceMarkers);
  const repeatedTarget =
    input.repeatedFocusTargets.length >= 5 &&
    new Set(input.repeatedFocusTargets).size === 1 &&
    input.repeatedFocusTargets[0] !== "";
  const findings: Finding[] = [];

  if (input.axeButtonUnnamed && sourceMarkers.has("ACCESSPATCH-DEMO-001")) {
    findings.push({
      id: "AP-EU-001",
      severity: "critical",
      rule: "button-name",
      sourceMarker: "ACCESSPATCH-DEMO-001",
      userImpact: "The payment action has no accessible name, so its purpose is unavailable to assistive technology users.",
      route: "/checkout",
      journeyStep: "Submit payment",
      selector: '[data-testid="payment-submit"]',
      htmlExcerpt:
        input.htmlExcerpts?.payment ??
        '<button class="payment-submit" data-testid="payment-submit" type="submit"><svg aria-hidden="true" /></button>',
      wcagTags: ["wcag2a", "wcag412"],
      evidencePaths: [input.evidencePaths.axe],
      remediationConstraint: "Keep the existing payment action and add a stable accessible name without duplicating visible controls.",
      verificationAssertion: 'The payment action has accessible name "Confirm and pay €42.00".',
    });
  }

  if (repeatedTarget && sourceMarkers.has("ACCESSPATCH-DEMO-002")) {
    findings.push({
      id: "AP-EU-002",
      severity: "critical",
      rule: "keyboard-focus-trap",
      sourceMarker: "ACCESSPATCH-DEMO-002",
      userImpact: "Keyboard users cannot move beyond the email field to reach and activate payment.",
      route: "/checkout",
      journeyStep: "Move from email to payment",
      selector: '[data-testid="email"]',
      htmlExcerpt:
        input.htmlExcerpts?.email ??
        '<input id="email" data-testid="email" type="email" aria-invalid="true" />',
      wcagTags: ["wcag211", "wcag212", "wcag2a"],
      evidencePaths: [input.evidencePaths.keyboard],
      remediationConstraint: "Preserve native Tab order without adding positive tabindex values or a replacement keyboard shortcut.",
      verificationAssertion: "Tab moves focus from the email field to the payment action.",
    });
  }

  if (!input.visibleErrorIsLive && sourceMarkers.has("ACCESSPATCH-DEMO-003")) {
    findings.push({
      id: "AP-EU-003",
      severity: "serious",
      rule: "validation-announcement",
      sourceMarker: "ACCESSPATCH-DEMO-003",
      userImpact: "The visible validation error is not exposed as a live announcement to assistive technology.",
      route: "/checkout",
      journeyStep: "Submit invalid email",
      selector: '[data-testid="form-error"]',
      htmlExcerpt:
        input.htmlExcerpts?.error ??
        '<p class="form-error" data-testid="form-error">Enter a valid email address before continuing.</p>',
      wcagTags: ["wcag2a", "wcag331", "wcag413"],
      evidencePaths: [input.evidencePaths.aria],
      remediationConstraint: "Announce the existing useful error message and return focus to the invalid email field.",
      verificationAssertion: "Invalid submission exposes an assertive alert and focuses the email field.",
    });
  }

  return findings;
}
