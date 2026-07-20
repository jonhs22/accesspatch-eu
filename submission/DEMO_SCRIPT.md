# AccessPatch EU demo script

Target runtime: 168 seconds. Output: English, 1920x1080, H.264/AAC.

| Time | Picture | Narration purpose |
| --- | --- | --- |
| 0:00-0:12 | Product title and blocked journey line | Establish that a finished-looking checkout can still block a keyboard user. |
| 0:12-0:34 | Synthetic checkout, dialog, five repeated Tab presses | Show the focus trap, unnamed payment control, and silent visible error. |
| 0:34-0:50 | Evidence capture rail | Show Playwright, axe-core, screenshot, DOM, ARIA, and keyboard trace. |
| 0:50-1:08 | Three stable finding rows | Connect AP-EU-001 through AP-EU-003 to source markers. |
| 1:08-1:31 | Evidence and source correlation | Explain that GPT-5.6 proposes from bounded evidence while deterministic tests decide pass/fail. |
| 1:31-1:48 | Approval gate | State that no source edit occurs before explicit human approval. |
| 1:48-2:08 | Approved source diff | Show that only `src/checkout/CheckoutPage.tsx` changes. |
| 2:08-2:26 | Replayed keyboard journey and receipt | Show all checks passing and order confirmation. |
| 2:26-2:48 | Build Week close and local judge commands | Explain Codex contribution, no-key path, evidence claim, and limitation. |

The visual composition uses only synthetic data, original UI, original motion,
and assets recorded in `assets/ASSET_LEDGER.md`. It shows no account chrome,
credentials, customer data, third-party logos, or fabricated Codex response.
