interface ClosableContext {
  close(): Promise<void>;
}

interface ManagedBrowser<TContext extends ClosableContext, TOptions> {
  newContext(options: TOptions): Promise<TContext>;
  close(): Promise<void>;
}

export interface BrowserContextLifecycleOptions<
  TContext extends ClosableContext,
  TOptions,
  TResult,
> {
  launch: () => Promise<ManagedBrowser<TContext, TOptions>>;
  contextOptions: TOptions;
  run: (context: TContext) => Promise<TResult>;
}

export async function withBrowserContext<
  TContext extends ClosableContext,
  TOptions,
  TResult,
>(
  options: BrowserContextLifecycleOptions<TContext, TOptions, TResult>,
): Promise<TResult> {
  let browser: ManagedBrowser<TContext, TOptions> | undefined;
  let context: TContext | undefined;
  let result: TResult | undefined;
  let primaryError: unknown;
  let failed = false;

  try {
    browser = await options.launch();
    context = await browser.newContext(options.contextOptions);
    result = await options.run(context);
  } catch (error) {
    failed = true;
    primaryError = error;
  }

  const cleanupErrors: unknown[] = [];
  if (context) {
    try {
      await context.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (failed) throw primaryError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];
  return result as TResult;
}
