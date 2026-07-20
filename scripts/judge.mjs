import {
  CHECKOUT_URL,
  DASHBOARD_URL,
} from "./start-server.mjs";

const instructions = [
  "AccessPatch EU — local judge path",
  "No login is required and no OpenAI API key is required.",
  "Run: npm run demo:verify",
  "Run: npm run dev",
  `Checkout URL: ${CHECKOUT_URL}`,
  `Dashboard URL: ${DASHBOARD_URL}`,
  "Expected result: AccessPatch verification: PASS",
  "Demo provenance: runMode deterministic_fixture; approval actor test_fixture.",
  "The fixture approval is test provenance, not a human approval.",
  "Press Ctrl+C to stop the separately launched npm run dev server.",
];

process.stdout.write(`${instructions.join("\n")}\n`);
