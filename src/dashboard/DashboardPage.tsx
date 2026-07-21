import { useEffect, useState } from "react";
import type {
  EvidenceSet,
  Finding,
  RunManifest,
} from "../contracts/run.js";
import type { DashboardRunModel } from "./dashboard-model.js";
import { useCurrentRun } from "./useCurrentRun.js";
import "./dashboard.css";

const JUDGE_COMMAND = "npm run demo:verify";

function artifactUrl(path: string): string {
  return path.startsWith("public/") ? `/${path.slice("public/".length)}` : "#";
}

function Metric({
  value,
  label,
  available = true,
}: {
  value: string | number | null;
  label: string;
  available?: boolean;
}) {
  return (
    <div className="ap-metric">
      <strong>{available && value !== null ? value : "—"}</strong>
      <span>{available ? label : `${label} · not captured yet`}</span>
    </div>
  );
}

function FindingCard({
  finding,
  manifest,
}: {
  finding: Finding;
  manifest: RunManifest;
}) {
  const proposal = manifest.proposals?.find(({ findingId }) => findingId === finding.id);
  const resolved = manifest.verification?.resolvedFindingIds.includes(finding.id);
  return (
    <article className="ap-finding">
      <header>
        <span className="ap-finding-id">{finding.id}</span>
        <span className={`ap-severity ap-severity--${finding.severity}`}>
          {finding.severity}
        </span>
        {resolved && <span className="ap-resolved">resolved</span>}
      </header>
      <h3>{finding.userImpact}</h3>
      <dl className="ap-finding-meta">
        <div>
          <dt>Runtime rule</dt>
          <dd>{finding.rule}</dd>
        </div>
        <div>
          <dt>Source marker</dt>
          <dd><code>{finding.sourceMarker}</code></dd>
        </div>
        <div>
          <dt>Journey step</dt>
          <dd>{finding.journeyStep}</dd>
        </div>
      </dl>
      {proposal ? (
        <div className="ap-proposal">
          <span>Proposed repair</span>
          <p>{proposal.proposedChange}</p>
          <code>{proposal.candidateFiles.join(", ")}</code>
        </div>
      ) : (
        <p className="ap-pending-copy">Proposal not recorded yet.</p>
      )}
      <details>
        <summary>Inspect evidence and constraint</summary>
        <p>{finding.remediationConstraint}</p>
        <pre>{finding.htmlExcerpt}</pre>
        <ul>
          {finding.evidencePaths.map((path) => (
            <li key={path}>
              <a href={artifactUrl(path)}>{path.split("/").at(-1)}</a>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function EvidenceFigure({
  evidence,
  label,
}: {
  evidence: EvidenceSet | undefined;
  label: string;
}) {
  return (
    <figure className="ap-evidence-figure">
      <div className="ap-evidence-frame">
        {evidence ? (
          <img src={artifactUrl(evidence.screenshotPath)} alt={`${label} checkout evidence`} />
        ) : (
          <div className="ap-empty-frame">Evidence not captured yet</div>
        )}
      </div>
      <figcaption>
        <span>{label}</span>
        {evidence ? (
          <span>{evidence.findings.length} blocker{evidence.findings.length === 1 ? "" : "s"}</span>
        ) : (
          <span>pending</span>
        )}
      </figcaption>
    </figure>
  );
}

function Journey({ model }: { model: DashboardRunModel }) {
  return (
    <nav className="ap-journey" aria-label="AccessPatch workflow">
      <ol>
        {model.journey.map((step, index) => (
          <li className={`ap-step ap-step--${step.state}`} key={step.id}>
            <span className="ap-step-number">{String(index + 1).padStart(2, "0")}</span>
            <span>{step.label}</span>
            <span className="ap-step-state">
              {step.state === "done" ? "complete" : step.state}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function JudgeCommand() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(JUDGE_COMMAND);
    setCopied(true);
  }

  return (
    <section className="ap-judge" aria-labelledby="judge-command-title">
      <div>
        <p className="ap-eyebrow">Run the genuine local workflow</p>
        <h2 id="judge-command-title">Judge command</h2>
        <p>
          This reproducible path records run mode <code>deterministic_fixture</code>
          {" "}and approval actor <code>test_fixture</code>. That actor is an automated
          fixture—not a human approval.
        </p>
      </div>
      <div className="ap-command">
        <code>{JUDGE_COMMAND}</code>
        <button
          type="button"
          aria-label={copied ? "Judge command copied" : "Copy judge command"}
          onClick={copyCommand}
        >
          {copied ? "Copied" : "Copy command"}
        </button>
      </div>
      <p className="ap-fixture-note">
        After verification, <code>demo:verify</code> restores the original deliberately
        broken fixture. The genuine before/after receipt remains here as evidence of
        the passed run.
      </p>
    </section>
  );
}

function RunDashboard({ model }: { model: DashboardRunModel }) {
  const manifest = model.manifest;
  const checkoutCheck = manifest.after?.journeyChecks.find(
    ({ id }) => id === "checkout-completes",
  );
  const approvalLabel = manifest.approval
    ? `${manifest.approval.decision} by ${manifest.approval.actor}`
    : "No approval recorded";

  return (
    <>
      <section className="ap-hero" aria-labelledby="ap-title">
        <div>
          <p className="ap-eyebrow">Evidence-backed accessibility repair</p>
          <h1 id="ap-title">From blocked checkout to verified journey.</h1>
          <p className="ap-lede">
            AccessPatch EU connects runtime evidence to source, requires explicit
            approval, constrains the patch, and replays the same keyboard path.
          </p>
        </div>
        <aside className={`ap-status ap-status--${model.tone}`} aria-live="polite">
          <span>Current state</span>
          <strong>{model.statusLabel}</strong>
          <code>{manifest.status}</code>
        </aside>
      </section>

      <div className="ap-provenance">
        <span>{model.provenance}</span>
        <span>Editable root: <code>{manifest.editableRoots[0]}</code></span>
        <span>Run: <code>{model.runId}</code></span>
      </div>

      <JudgeCommand />

      <Journey model={model} />

      <section className="ap-metrics" aria-label="Run metrics">
        <Metric
          value={model.baselineFindingCount}
          label="baseline blockers"
          available={Boolean(manifest.before)}
        />
        <Metric
          value={model.resolvedFindingCount}
          label="resolved blockers"
          available={Boolean(manifest.verification)}
        />
        <Metric
          value={checkoutCheck?.passed ? "PASS" : checkoutCheck ? "FAIL" : null}
          label="keyboard checkout"
          available={Boolean(checkoutCheck)}
        />
        <Metric
          value={manifest.verification?.regressions.length ?? null}
          label="new serious / critical"
          available={Boolean(manifest.verification)}
        />
      </section>

      <section className="ap-section" aria-labelledby="evidence-title">
        <div className="ap-section-heading">
          <div>
            <p className="ap-eyebrow">Before / after evidence</p>
            <h2 id="evidence-title">The receipt starts with what the browser saw.</h2>
          </div>
          <a className="ap-text-link" href={model.targetUrl}>Open restored broken fixture</a>
        </div>
        <div className="ap-evidence-grid">
          <EvidenceFigure evidence={manifest.before} label="Before patch" />
          <EvidenceFigure evidence={manifest.after} label="After patch" />
        </div>
      </section>

      <section className="ap-section" aria-labelledby="findings-title">
        <div className="ap-section-heading">
          <div>
            <p className="ap-eyebrow">Stable blocker identities</p>
            <h2 id="findings-title">Every claim points to evidence and source.</h2>
          </div>
          <span className="ap-approval">{approvalLabel}</span>
        </div>
        {manifest.before ? (
          <div className="ap-findings">
            {manifest.before.findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} manifest={manifest} />
            ))}
          </div>
        ) : (
          <div className="ap-inline-empty">Findings will appear after baseline capture.</div>
        )}
      </section>

      <section className="ap-section ap-verification" aria-labelledby="verification-title">
        <div>
          <p className="ap-eyebrow">Deterministic verification</p>
          <h2 id="verification-title">
            {manifest.verification?.outcome === "passed"
              ? "The approved repair passed every gate."
              : manifest.verification?.outcome === "failed"
                ? "The run failed honestly."
                : "Verification receipt pending."}
          </h2>
        </div>
        {manifest.verification ? (
          <div className="ap-receipt">
            <div>
              <span>Resolved</span>
              <strong>{manifest.verification.resolvedFindingIds.length} / 3</strong>
            </div>
            <div>
              <span>Checkout</span>
              <strong>{manifest.verification.checkoutCompleted ? "PASS" : "FAIL"}</strong>
            </div>
            <div>
              <span>Diff allowlist</span>
              <strong>{manifest.verification.diffWithinAllowlist ? "PASS" : "FAIL"}</strong>
            </div>
            <div>
              <span>Regressions</span>
              <strong>{manifest.verification.regressions.length}</strong>
            </div>
            <a href={artifactUrl(manifest.verification.diffPath)}>Inspect approved source diff</a>
          </div>
        ) : (
          <p className="ap-pending-copy">No metrics are shown until the verifier writes them.</p>
        )}
        {manifest.error && (
          <div className="ap-error-detail" role="alert">
            <strong>{manifest.error.code}</strong>
            <p>{manifest.error.message}</p>
          </div>
        )}
      </section>

      <section className="ap-tooling" aria-label="Reproducibility details">
        <div>
          <p className="ap-eyebrow">Toolchain</p>
          <code>Node {manifest.toolVersions.node}</code>
          <code>Playwright {manifest.toolVersions.playwright}</code>
          <code>axe-core {manifest.toolVersions.axe}</code>
          <code>AccessPatch {manifest.toolVersions.accesspatch}</code>
        </div>
        <p>
          AccessPatch EU produces technical remediation evidence—not legal advice,
          accessibility certification, or a guarantee of EAA/WCAG compliance.
          AI-proposed patches require human review.
        </p>
      </section>
    </>
  );
}

export function DashboardPage() {
  const { loading, model, refresh } = useCurrentRun();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "AccessPatch EU";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="accesspatch-page">
      <header className="ap-header">
        <a className="ap-brand" href="/accesspatch" aria-label="AccessPatch EU dashboard">
          <span aria-hidden="true">AP</span>
          <strong>AccessPatch EU</strong>
        </a>
        <div>
          <span className="ap-track">OpenAI Build Week · Developer Tools</span>
          <a href="/checkout">Checkout fixture</a>
          <button type="button" onClick={refresh}>Refresh evidence</button>
        </div>
      </header>

      {loading && !model ? (
        <section className="ap-load" aria-live="polite">
          <span className="ap-load-signal" aria-hidden="true" />
          <p>Loading the signed evidence manifest…</p>
        </section>
      ) : model?.kind === "run" ? (
        <RunDashboard model={model} />
      ) : (
        <section className="ap-load ap-load--error" role="alert">
          <p className="ap-eyebrow">Evidence unavailable</p>
          <h1>{model?.title ?? "Run evidence could not be loaded"}</h1>
          <p>{model?.message ?? "Refresh the page or create a new deterministic run."}</p>
          <button type="button" onClick={refresh}>Try again</button>
        </section>
      )}
    </main>
  );
}
