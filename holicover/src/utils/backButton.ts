/**
 * Android's hardware back button and back gesture.
 *
 * A WebView does not wire these to anything, so without this the back gesture
 * closes the whole app from any screen — which is how the day assignment
 * screen became a dead end.
 *
 * Anything that sits *over* a screen (a modal, a confirmation) pushes an
 * interceptor so back dismisses it rather than navigating out from underneath
 * it, which is what Android users expect.
 */
type Interceptor = () => void;

const interceptors: Interceptor[] = [];

/** Register a handler that back should run instead of navigating. */
export function pushBackInterceptor(handler: Interceptor): () => void {
  interceptors.push(handler);
  return () => {
    const index = interceptors.indexOf(handler);
    if (index !== -1) interceptors.splice(index, 1);
  };
}

export type BackOutcome = 'intercepted' | 'navigated' | 'exit';

/**
 * Decide what a back press should do, newest interceptor first.
 *
 * Returns what happened so the caller can exit the app, which only it can do.
 */
export function handleBackPress(
  canGoBack: boolean,
  goBack: () => void = () => window.history.back(),
): BackOutcome {
  const top = interceptors[interceptors.length - 1];
  if (top) {
    top();
    return 'intercepted';
  }
  if (canGoBack) {
    goBack();
    return 'navigated';
  }
  return 'exit';
}

/** Test helper: forget every registered interceptor. */
export function clearBackInterceptors(): void {
  interceptors.length = 0;
}
