export interface CleanupFailure {
  label: string;
  error: unknown;
}

export async function attemptCleanup(
  failures: CleanupFailure[],
  label: string,
  action: () => Promise<void>,
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    failures.push({ label, error });
    return false;
  }
}

export function cleanupAggregateError(
  scope: string,
  failures: CleanupFailure[],
): AggregateError {
  return new AggregateError(
    failures.map(({ error }) => error),
    `${scope} cleanup failed: ${failures.map(({ label }) => label).join(", ")}.`,
  );
}
