import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBackInterceptors, handleBackPress, pushBackInterceptor } from '../backButton';

afterEach(() => clearBackInterceptors());

describe('handleBackPress', () => {
  it('navigates back when there is history and nothing layered over the screen', () => {
    const goBack = vi.fn();
    expect(handleBackPress(true, goBack)).toBe('navigated');
    expect(goBack).toHaveBeenCalledOnce();
  });

  it('asks to exit at the first screen', () => {
    const goBack = vi.fn();
    expect(handleBackPress(false, goBack)).toBe('exit');
    expect(goBack).not.toHaveBeenCalled();
  });

  it('closes an open modal instead of navigating out from under it', () => {
    const close = vi.fn();
    const goBack = vi.fn();
    pushBackInterceptor(close);

    expect(handleBackPress(true, goBack)).toBe('intercepted');
    expect(close).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('closes the newest layer first', () => {
    const order: string[] = [];
    pushBackInterceptor(() => order.push('modal'));
    pushBackInterceptor(() => order.push('confirm'));

    handleBackPress(true, vi.fn());
    expect(order).toEqual(['confirm']);
  });

  it('falls back to navigating once every layer has gone', () => {
    const goBack = vi.fn();
    const remove = pushBackInterceptor(vi.fn());
    remove();

    expect(handleBackPress(true, goBack)).toBe('navigated');
    expect(goBack).toHaveBeenCalledOnce();
  });

  it('removes the right layer when they unmount out of order', () => {
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = pushBackInterceptor(first);
    pushBackInterceptor(second);

    removeFirst();
    handleBackPress(true, vi.fn());
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('still exits at the first screen when a layer was opened and closed', () => {
    const remove = pushBackInterceptor(vi.fn());
    remove();
    expect(handleBackPress(false, vi.fn())).toBe('exit');
  });
});
