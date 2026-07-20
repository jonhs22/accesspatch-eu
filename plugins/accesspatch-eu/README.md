# AccessPatch EU Codex plugin

This repo-local plugin exposes `$accesspatch-eu:accesspatch`, a guarded workflow
for the synthetic checkout included in this repository.

It captures reproducible browser evidence, connects three stable accessibility
blockers to source, records proposals, pauses for explicit human approval,
limits edits to `src/checkout`, and accepts success only from the deterministic
verifier.

The primary workflow uses the signed-in Codex client. It never reads Codex
credentials and does not request an OpenAI Platform API key.

## Local marketplace

The repository marketplace is declared in `.agents/plugins/marketplace.json`.
From the repository root, add it to Codex with:

```text
codex plugin marketplace add .
```

Then install `accesspatch-eu` through the Codex Plugins interface. Installing
or publishing is intentionally separate from repository validation because it
changes user-level Codex state.
