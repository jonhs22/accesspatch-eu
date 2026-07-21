# Test credentials

No login is required and no OpenAI Platform API key is required for the local
judge path.

AccessPatch EU uses a synthetic localhost checkout with no authentication,
account, payment provider, customer record, or live transaction. Run:

```text
npm ci
npx playwright install chromium
npm run demo:verify
npm run judge
```

The expected final line is:

```text
AccessPatch verification: PASS
```

The primary interactive plugin path uses the submitter's already signed-in
Codex client. Judges who only need to reproduce the evidence loop use the
deterministic fixture path above and do not need a Codex account.
