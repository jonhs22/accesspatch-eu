# AccessPatch EU demo transcript

A checkout can look finished and still stop a keyboard user cold. AccessPatch
EU turns that failure into an evidence-backed patch, then proves the same
journey works.

This is the real synthetic Lattice Supply checkout on localhost. I open secure
checkout and use only the keyboard. Every Tab is intercepted and returned to
the invalid email. Five presses later, focus has not moved. The payment control
is unnamed, and the visible error is silent to assistive technology.

Now I run `npm run demo:verify`. This is genuine process output. The script
resets the fixture, starts the app, captures before evidence, writes
deterministic proposals, installs the frozen repair, scans again, verifies the
journey, and restores the original source bytes.

The evidence pack contains a screenshot, sanitized DOM and accessibility data,
a keyboard trace, and source hints. It produces three stable findings:
AP-EU-001 and AP-EU-002 are critical; AP-EU-003 is serious. External requests
are blocked and stored form values are scrubbed.

For judges, this path is labeled `deterministic_fixture` with approval actor
`test_fixture`. It needs no login and never pretends a person approved it.
Separately, the interactive workflow runs inside signed-in Codex. GPT-5.6
proposes bounded candidate changes, but cannot approve them or decide whether
they pass.

Every edit is limited to `src/checkout/CheckoutPage.tsx`. The real diff removes
the Tab trap, names the payment action `Confirm and pay €42.00`, connects the
error with `aria-describedby`, adds alert and `aria-live` semantics, and
focuses the invalid email. The allowlist rejects every other file.

AccessPatch replays the same Playwright journey. Tab advances, the payment
action exposes its name, invalid input is announced, and a valid keyboard
submission reaches order confirmation. Deterministic checks, not the model,
decide the outcome.

The receipt is real: two critical and one serious blocker are resolved, no new
serious or critical regression appears, keyboard checkout passes, and the diff
stays inside the approved root. The demo then restores the broken fixture byte
for byte, keeping the repository repeatable while the dashboard retains genuine
before and after evidence.

To judge it, run `npm ci`, install Playwright Chromium, then run
`npm run demo:verify`. The terminal ends with `AccessPatch verification: PASS`.
This route needs no OpenAI Platform API key; the interactive route uses
signed-in Codex. AccessPatch EU provides technical evidence, not legal advice,
certification, or guaranteed compliance.
