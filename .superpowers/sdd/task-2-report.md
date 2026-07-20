# Task 2 — reproducible blocked checkout report

## Scope

Implemented the synthetic Lattice Supply `/checkout` only. No AccessPatch
dashboard or external runtime integration was added. All customer, delivery,
and order values are synthetic; the product art is the repository-local
`/assets/contour-pack-18l.png` asset.

## RED → GREEN evidence

1. Added `tests/e2e/checkout-fixtures.spec.ts` before any checkout source.
2. Ran `npx playwright test tests/e2e/checkout-fixtures.spec.ts` before the
   app/config existed. It failed at `page.goto("/checkout")` with
   `Protocol error (Page.navigate): Cannot navigate to invalid URL`, proving
   the missing route/base URL rather than a passing pre-existing checkout.
3. Added the Vite bootstrap, local `baseURL`/`webServer`, broken checkout, and
   repository-local fixtures. Playwright 1.61 requires an explicit expected
   string for `toHaveAccessibleName`, so the baseline assertion uses the
   equivalent empty accessible name assertion.
4. The original focused GREEN run passed both tests:
   - broken fixture detects repeated Email focus, an empty payment-control
     accessible name, and a visible non-alert validation error;
   - repaired fixture has the exact label `Confirm and pay €42.00`, announces
     validation, focuses Email after invalid submit, preserves native Tab, and
     reaches `data-testid="order-confirmation"` after keyboard submission.
5. Review remediation followed a second RED → GREEN cycle. New unit/static
   assertions failed because Playwright had no global serialization,
   `playwright.config.ts` was absent from `tsconfig.json`, and the manifest
   mapped marker descriptions incorrectly. The keyboard-only repaired journey
   also failed because the activated trigger disappeared. After the scoped
   corrections, 4 unit/static assertions and all 3 focused browser tests pass.

## Files

- `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- `src/checkout/CheckoutPage.tsx`, `src/checkout/checkout.css`
- `fixtures/broken-demo/CheckoutPage.tsx`
- `fixtures/repaired-demo/CheckoutPage.tsx`
- `fixtures/FIXTURE_MANIFEST.md`
- `tests/e2e/checkout-fixtures.spec.ts`
- `tests/unit/playwright-config.test.ts`,
  `tests/unit/checkout-fixture-manifest.test.ts`
- `playwright.config.ts`, `tsconfig.json`, `src/vite-env.d.ts`, `index.html`

The baseline source and reset fixture each contain exactly three markers:
`ACCESSPATCH-DEMO-001` (unnamed payment control), `002` (Email Tab trap), and
`003` (silent validation). The repaired fixture changes only those
evidence-backed behaviors. Fixture swapping is serial, local to the repository,
and restores the checked-in baseline as its original byte buffer in a `finally`
block. Playwright is globally restricted to one worker with
`fullyParallel: false`, so future source-swap specs cannot race.

The repaired success journey is keyboard-only: Enter opens checkout, typed
input replaces the synthetic invalid email, Tab reaches payment, and Enter
submits. `requestSubmit()` now lives in its own named announcement-semantics
probe. The repaired fixture's overlay truthfully reads `Tab moves through
checkout controls`; that textual evidence change is coupled directly to
removing the repeated-Tab blocker, not a fourth functional repair.

## Visual comparison and self-review

Reviewed capture: `.superpowers/sdd/task-2-checkout-1672x941.png` at the
native 1672×941 viewport.

- Copy: brand, checkout stages, order details, `Complete your order`, error,
  keyboard overlay, product name, and prices match the required visible copy.
- Layout: the transaction surface uses a 68% paper column and the receipt a
  32% full-height ink band; small screens stack the receipt after checkout.
- Typography and palette: explicit Segoe controls, strong display headings,
  Cascadia-style keyboard text, warm paper, deep ink, coral blocker treatment,
  and restrained mint/sage details are used.
- Product art: local Contour Pack artwork is present in the receipt, with no
  third-party logos or requests.
- Focus: native controls have a two-layer visible focus treatment. The broken
  Email handler deliberately prevents Tab and the overlay starts at `Tab × 5`
  then increments as Tab is pressed. The repaired fixture removes that handler
  and reports its native traversal truthfully. Both fixture surfaces now expose
  the same dialog semantics (`role="dialog"`, `aria-modal="true"`, and the
  `checkout-title` relationship), so they are not a repair-only delta.
- Trigger: the activated `Start secure checkout` control remains visible at the
  upper right of the Payment row, matching the accepted reference's persistent
  trigger while exposing a clear current state.
- Motion: no animation is required for the checkout; reduced-motion styles
  explicitly neutralize any transitions.

Intentional deviation: the concept's red dashed explanatory arrow and
`Focus returns to Email` callout are omitted. The persistent keyboard overlay
is the code-native evidence surface, avoids decorative annotation over form
copy, and records the live Tab count instead.

## Validation

Fresh successful commands:

```text
npx playwright test tests/e2e/checkout-fixtures.spec.ts  # 3 passed
npm test                                                  # all unit tests passed
npm run typecheck                                        # exit 0
npm run build                                            # exit 0
git diff --check                                         # exit 0
```

The screenshot review above used a local Vite server and a Chromium capture at
the required native viewport. Source-marker count check reported
`source=3 broken-fixture=3`.

## Commit

Baseline task commit message: `feat: add reproducible blocked checkout`.
Review remediation is committed separately without rewriting that baseline.
The final narrow follow-up is also a separate commit: it keeps the broad broken
fixture test strictly about the focus trap and unnamed payment action, leaves
`requestSubmit()` only in the named repaired announcement probe, and restores
the activated trigger's green reference color.

## Concerns

None for the scoped checkout. The intentionally broken source is expected to
fail accessibility checks until the later, explicitly approved repair workflow
copies the repaired fixture into `src/checkout`. The reference's dashed arrow
remains intentionally omitted in favor of the live keyboard overlay.
