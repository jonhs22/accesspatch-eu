# AccessPatch EU

**Tagline:** From blocked keyboard checkout to approved source patch and
deterministic proof.

## Inspiration

A checkout can look polished while still trapping a keyboard user before
payment. Conventional scanners identify violations, but developers must still
connect runtime behavior to source, choose a bounded repair, and prove that the
same journey now works. AccessPatch EU closes that loop inside Codex.

## What it does

AccessPatch EU runs a synthetic localhost checkout through Playwright and
axe-core, captures privacy-scrubbed evidence, assigns three stable finding IDs,
and maps each finding to a source marker. GPT-5.6 correlates bounded browser
evidence with source and proposes the smallest candidate change. The
interactive workflow pauses for explicit human approval, restricts edits to
`src/checkout`, replays the same keyboard journey, and publishes a validated
before/after receipt.

For judges, a no-login deterministic fixture path performs the same scans and
verification without an account or OpenAI Platform API key. Its manifest is
plainly labeled `deterministic_fixture` with actor `test_fixture`; it is not
represented as human approval.

Two critical and one serious fixture blocker were resolved, no new serious or critical axe finding appeared, and the scripted keyboard checkout completed.

## How we built it

The single Vite/React application serves the Lattice Supply checkout and the
evidence dashboard. A TypeScript CLI orchestrates strict Zod contracts, atomic
run storage, Playwright traces, sanitized DOM and accessibility evidence,
stable finding normalization, proposal and approval transitions, a Git
allowlist, and deterministic verification.

Codex and GPT-5.6 accelerated architecture, implementation, testing, visual
iteration, plugin packaging, and submission tooling. The model proposes from
evidence; deterministic tests decide pass/fail. The human chose the problem,
approved the design and safety boundary, and owns every real approval and
external publishing action.

## Challenges

The hardest part was preserving trustworthy provenance across a source-mutating
demo. The implementation must atomically publish evidence, scrub form values,
block external HTTP and WebSocket traffic, distinguish human approval from a
fixture stand-in, reject out-of-scope diffs, and restore exact source bytes
after success, failure, or interruption.

## Accomplishments

- Three stable blockers connect browser evidence to source markers.
- Interactive edits cannot begin before explicit human approval.
- The final diff must stay inside both `src/checkout` and approved candidates.
- The dashboard shows evidence, proposals, diff, tool versions, and receipt
  without invented metrics.
- `npm run demo:verify` ends with `AccessPatch verification: PASS`.
- The local judge path needs no login, credentials, or OpenAI Platform API key.

## What we learned

Model reasoning is most useful when its evidence boundary is small and
inspectable. Verification should remain deterministic and independent from the
model that proposed a patch. Clear provenance labels are as important as the
repair itself.

## What's next

Future work could add more explicitly modeled journeys and framework adapters
while retaining the same approval, privacy, allowlist, and deterministic
verification boundaries. Arbitrary public-site auditing and legal
certification remain outside scope.

## Limitation

AccessPatch EU produces technical remediation evidence, not legal advice, certification, or a guarantee of EAA/WCAG compliance. AI-proposed patches require human review.

## Demo video

Public YouTube URL: https://youtu.be/K0bKkyyBVIE

Public source repository: https://github.com/jonhs22/accesspatch-eu

Primary Codex Session ID: `019f7fed-5bbd-78e1-83b8-8c5ef532a3af`

The published video uses the verified `submission/accesspatch-eu-demo.mp4`, the
submission thumbnail, and the timed English captions in
`submission/DEMO_CAPTIONS.srt`.
