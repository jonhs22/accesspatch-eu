# Checkout fixture manifest

The checked-in checkout at `src/checkout/CheckoutPage.tsx` is the broken
baseline. It contains exactly the three curated source markers:

| Marker | Demonstrated blocker | Repaired behavior |
| --- | --- | --- |
| `ACCESSPATCH-DEMO-001` | Payment action has no accessible name. | The exact name is `Confirm and pay €42.00`. |
| `ACCESSPATCH-DEMO-002` | Tab returns to Email. | Native Tab order is preserved. |
| `ACCESSPATCH-DEMO-003` | Visible validation is not announced. | Validation is an assertive alert. |

`fixtures/broken-demo/CheckoutPage.tsx` is a reset copy. The Playwright fixture
test temporarily copies `fixtures/repaired-demo/CheckoutPage.tsx` into the
checkout source, then restores the original source in `finally`. These swaps
are serial and repository-local; both fixtures use synthetic data only.
