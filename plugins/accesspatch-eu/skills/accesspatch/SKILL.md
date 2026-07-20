---
name: accesspatch
description: Diagnose, propose, explicitly approve, patch, and verify the AccessPatch EU synthetic localhost checkout. Use when a user asks to run the accessibility repair demo, inspect its evidence pack, or repair the three stable keyboard blockers.
---

# AccessPatch EU

Run the repository's evidence-backed workflow. Treat the scanner, manifest
schema, Git guard, and verifier as the authority. Model output is a proposal,
never proof that a repair passed.

## Safety contract

Do not edit source before explicit approval.

- Work only in the repository that contains `accesspatch.config.json`.
- Accept only the configured `http://localhost`, `https://localhost`,
  `http://127.0.0.1`, or `https://127.0.0.1` target.
- Never read Codex credential files, browser account data, tokens, secrets, or
  unrelated environment variables. This signed-in Codex workflow does not
  request or require an OpenAI Platform API key.
- Before the interactive baseline, run `git status --porcelain=v1 -z`. Stop
  and report a truthful failure if the worktree is dirty.
- The only editable product root is `src/checkout`. Never edit `tests`,
  `tools`, `fixtures`, `public`, plugin files, configuration, or evidence to
  make a verification pass.
- Do not weaken tests, scanner assertions, stable finding IDs, approval gates,
  the diff allowlist, or the verifier.

## Interactive workflow

### 1. Confirm and capture

Read `accesspatch.config.json` and confirm the target is localhost. Then run:

```text
npm run accesspatch -- scan --phase before --run-mode interactive
```

Read `public/runs/current.json` and the referenced before-phase `keyboard.json`,
`axe.json`, `aria.yml`, `dom.html`, and screenshot. Diagnose only the stable
findings actually present. Cite their evidence paths and source markers.

### 2. Record proposals

Prepare exactly one proposal for each baseline finding. Each proposal needs the
finding ID, evidence-backed diagnosis, smallest behavioral change, and sorted
candidate files below `src/checkout`.

Write the proposal array to a project-local JSON file, then run:

```text
npm run accesspatch -- proposals write --input <project-local-proposals.json>
```

Show the user:

- every finding ID and user impact;
- proposed behavior and candidate files;
- the editable root `src/checkout`; and
- that no source has been edited.

### 3. Wait for explicit approval

Pause. Ask the human to approve or reject the displayed proposal set. Do not
infer approval from the original request, silence, enthusiasm, or permission
to inspect.

After a clear approval, record the exact stable IDs:

```text
npm run accesspatch -- approval record --decision approved --actor human --finding AP-EU-001 --finding AP-EU-002 --finding AP-EU-003
```

For a rejection, record `--decision rejected --actor human` with the rejected
finding IDs and stop. Report the resulting `APPROVAL_REJECTED` failure honestly.

### 4. Apply the bounded patch

Re-read `public/runs/current.json`; continue only when its state is `patching`,
its actor is `human`, and its decision is `approved`. Edit only approved
candidate files under `src/checkout`.

Use the smallest behavioral patch:

- provide a useful accessible name;
- remove the demonstrated Tab trap; and
- expose validation as a live announcement while focusing the invalid field.

Inspect `git diff --name-status -z` immediately. Stop if any changed or
untracked path is outside the approved candidates and `src/checkout`.

### 5. Replay and verify

Run:

```text
npm run accesspatch -- scan --phase after
npm run accesspatch -- verify
```

Success requires the verifier itself to report all of the following:

- AP-EU-001, AP-EU-002, and AP-EU-003 resolved;
- the complete keyboard journey check set present and passing;
- checkout confirmation reached;
- no new serious or critical axe finding; and
- every changed file inside the approved allowlist.

Report the exact commands, exit outcomes, manifest status, evidence paths, and
approved diff path. On any command or verifier failure, stop and state the
actual failure; never claim partial output as a pass.

## Deterministic judge path

For a no-login fixture demonstration, use:

```text
npm run demo:verify
npm run judge
```

Label this provenance as `deterministic_fixture` with approval actor
`test_fixture`. Never describe it as genuine human approval. The real
interactive workflow above always requires actor `human`.
