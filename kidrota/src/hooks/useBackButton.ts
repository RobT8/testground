import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { handleBackPress, pushBackInterceptor } from '../utils/backButton';

/**
 * Wire Android's back button once, at the top of the app.
 *
 * No-op in a browser, which has its own back button already.
 */
export function useAndroidBackButton(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        if (handleBackPress(canGoBack) === 'exit') App.exitApp();
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}

/**
 * While mounted, send back presses to `onBack` instead of navigating.
 * Used by anything layered over a screen.
 */
export function useBackInterceptor(onBack: () => void): void {
  useEffect(() => pushBackInterceptor(onBack), [onBack]);
}
