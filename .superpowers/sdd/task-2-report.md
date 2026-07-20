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
4. The focused GREEN run passed both tests:
   - broken fixture detects repeated Email focus, an empty payment-control
     accessible name, and a visible non-alert validation error;
   - repaired fixture has the exact label `Confirm and pay €42.00`, announces
     validation, focuses Email after invalid submit, preserves native Tab, and
     reaches `data-testid="order-confirmation"` after keyboard submission.

## Files

- `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- `src/checkout/CheckoutPage.tsx`, `src/checkout/checkout.css`
- `fixtures/broken-demo/CheckoutPage.tsx`
- `fixtures/repaired-demo/CheckoutPage.tsx`
- `fixtures/FIXTURE_MANIFEST.md`
- `tests/e2e/checkout-fixtures.spec.ts`
- `playwright.config.ts`, `tsconfig.json`, `src/vite-env.d.ts`, `index.html`

The baseline source and reset fixture each contain exactly three markers:
`ACCESSPATCH-DEMO-001` (unnamed payment control), `002` (Email Tab trap), and
`003` (silent validation). The repaired fixture changes only those
evidence-backed behaviors. Fixture swapping is serial, local to the repository,
and restores the checked-in baseline in a `finally` block.

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
  then increments as Tab is pressed. The repaired fixture removes that handler.
- Motion: no animation is required for the checkout; reduced-motion styles
  explicitly neutralize any transitions.

Intentional deviation: the concept's red dashed explanatory arrow and
`Focus returns to Email` callout are omitted. The persistent keyboard overlay
is the code-native evidence surface, avoids decorative annotation over form
copy, and records the live Tab count instead.

## Validation

Fresh successful commands:

```text
npx playwright test tests/e2e/checkout-fixtures.spec.ts  # 2 passed
npm run typecheck                                        # exit 0
npm run build                                            # exit 0
git diff --check                                         # exit 0
```

The screenshot review above used a local Vite server and a Chromium capture at
the required native viewport. Source-marker count check reported
`source=3 broken-fixture=3`.

## Commit

Task commit message: `feat: add reproducible blocked checkout`.

## Concerns

None for the scoped checkout. The intentionally broken source is expected to
fail accessibility checks until the later, explicitly approved repair workflow
copies the repaired fixture into `src/checkout`.
