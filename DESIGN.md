# AccessPatch EU — Visual Identity

## Style Prompt

AccessPatch EU is an evidence instrument, not a generic SaaS dashboard. Its
interface combines a deep ink technical canvas with warm-white working
surfaces. Coral appears only where a keyboard journey is blocked; mint appears
only where evidence, approval, or verification is positive. Open rails, lists,
rules, and source panes carry the information instead of stacked card grids.
The synthetic Lattice Supply checkout uses the same materials in reverse:
warm-white transaction space on the left and an ink order-summary band on the
right.

The three production references are:

- `assets/design/concepts/checkout-blocked.png`
- `assets/design/concepts/accesspatch-awaiting-approval.png`
- `assets/design/concepts/accesspatch-verified.png`

## Colors

| Token | Value | Role |
| --- | --- | --- |
| `--ink-950` | `#07100d` | Deep dashboard and order-summary canvas |
| `--ink-900` | `#111815` | Primary dark surface |
| `--paper-50` | `#f5f4ee` | Warm-white checkout and inspector surface |
| `--paper-100` | `#ebeae3` | Muted light surface |
| `--text-on-dark` | `#f7f7f2` | Primary text on ink |
| `--text-on-light` | `#101714` | Primary text on paper |
| `--sage-500` | `#7c9b87` | Secondary text, rules, inactive evidence |
| `--sage-700` | `#40574b` | Darker rules and code chrome |
| `--mint-300` | `#9effb8` | Verified, completed, approved |
| `--mint-500` | `#58d982` | Interactive positive state |
| `--coral-400` | `#ff6b5f` | Blocker, failed journey, destructive state |
| `--coral-600` | `#d74a42` | High-contrast coral text on paper |

Do not invent blue or purple product accents. Mint and coral are semantic, not
decorative.

## Typography

- Display and headings: `"Segoe UI Variable Display", "Segoe UI", Arial,
  sans-serif`; weight `650–750`; tight but not compressed tracking.
- Body and controls: `"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif`;
  weight `400–650`.
- Evidence IDs, paths, hashes, keys, and code:
  `"Cascadia Mono", "SFMono-Regular", Consolas, monospace`.
- Minimum production sizes: `16px` labels, `18px` body, `32px` page heading,
  `56px` status display. Video-focused desktop layouts may scale higher.
- Controls must declare their typography explicitly. Never rely on the browser
  default button or input font.

## Layout and Components

- Native concept frame: `1672 × 941`; browser fidelity captures use that
  viewport. Final demo captures normalize to `1920 × 1080`.
- Dashboard: 72px top bar, 18% run rail, fluid evidence workspace, 33% source
  or receipt inspector.
- Checkout: 68% transaction surface and 32% full-height order-summary band.
- Use 1px rules, open rows, and restrained 8–10px radii. One purposeful panel is
  allowed for a checkout dialog, code diff, screenshot, or verification receipt.
- Button focus rings use two layers: a 2px semantic border and a 3px paper/ink
  separation ring.
- Use original inline SVG icons with `currentColor`, a 1.8px stroke, round caps,
  and no third-party logo shapes.
- Evidence links are thin lines that connect a finding to browser evidence and
  source ownership. They must never obscure copy.

## Motion

- `160ms` for focus, hover, and selected-row feedback.
- `280ms` for evidence-row or inspector transitions.
- `520ms` for scan-line and verification-state reveals.
- Use ease-out motion for evidence arriving and a restrained ease-in-out for
  state transitions.
- The scan line moves once per state change; there are no infinite loops.
- Respect `prefers-reduced-motion: reduce` by removing travel and preserving
  only instant state changes.

## Required States and Copy

### Broken checkout

- Brand: `Lattice Supply`
- Trigger: `Start secure checkout`
- Dialog title: `Complete your order`
- Amount: `€42.00`
- Visible error: `Enter a valid email address before continuing.`
- Keyboard overlay: `Tab × 5 · focus repeats on Email`

### Awaiting approval

- Heading: `Keyboard checkout is blocked`
- Status: `3 blockers`
- Findings: `AP-EU-001`, `AP-EU-002`, `AP-EU-003`
- Primary action: `Approve patch`
- Secondary action: `Reject`
- Scope: `Editable root: src/checkout`

### Verified

- Heading: `Keyboard checkout completed`
- Status: `PASS`
- Receipt claims:
  - `3 / 3 known blockers resolved`
  - `Keyboard journey completed`
  - `0 new critical axe findings`
  - `Diff stayed inside editable root`
- Disclaimer: `Technical remediation evidence — not legal certification.`

## Responsive Behavior

- At widths below `1180px`, the dashboard inspector moves below the evidence
  workspace and the run rail becomes a horizontal progress strip.
- At widths below `760px`, the checkout order summary follows the form, finding
  rows wrap into two lines, and code diffs scroll horizontally inside their own
  region.
- Primary actions remain visible without horizontal page scrolling.

## What NOT to Do

- No bento grids, glassmorphism, giant rounded wrappers, decorative metric
  cards, filler pills, avatars, confetti, or stock dashboard charts.
- No generic blue/purple gradients, neon cyberpunk glow, or full-screen linear
  gradients.
- No third-party retailer, payment-provider, OpenAI, Devpost, or browser logos.
- No real payment details or customer data.
- No `100% accessible`, `WCAG compliant`, `EAA compliant`, certification, or
  legal-advice claim.
- No motion that hides evidence, traps keyboard focus, or ignores reduced-motion
  preferences.
