import { BackHandler, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useHardwareBack } from './useHardwareBack';

// Like React Native: the newest listener runs first, and back leaves the app when none
// of them takes it.
let listeners: (() => boolean | null | undefined)[] = [];
let exited = 0;
beforeEach(() => {
  listeners = [];
  exited = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler);
    return { remove: () => (listeners = listeners.filter((h) => h !== handler)) };
  });
});
afterEach(() => jest.restoreAllMocks());

const pressBack = () =>
  act(() => {
    if (![...listeners].reverse().some((handler) => handler())) exited += 1;
  });

describe('useHardwareBack', () => {
  if (Platform.OS !== 'android') {
    it("doesn't touch BackHandler on web", async () => {
      await renderHook(() => useHardwareBack(() => {}));
      if (Platform.OS === 'web') expect(BackHandler.addEventListener).not.toHaveBeenCalled();
    });
    return;
  }

  it('runs the handler and keeps the app open', async () => {
    const onBack = jest.fn();
    await renderHook(() => useHardwareBack(onBack));
    await pressBack();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(exited).toBe(0);
  });

  it('lets the newest screen answer first, like an overlay over a tab', async () => {
    const tab = jest.fn();
    const overlay = jest.fn();
    await renderHook(() => useHardwareBack(tab));
    const top = await renderHook(() => useHardwareBack(overlay));
    await pressBack();
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(tab).not.toHaveBeenCalled();
    await act(async () => top.unmount());
    await pressBack();
    expect(tab).toHaveBeenCalledTimes(1);
  });

  it('passes back on when the handler returns false', async () => {
    await renderHook(() => useHardwareBack(() => false));
    await pressBack();
    expect(exited).toBe(1);
  });

  it('stays out of the way while turned off', async () => {
    const off = jest.fn();
    await renderHook(() => useHardwareBack(off, false));
    await pressBack();
    expect(off).not.toHaveBeenCalled();
    expect(exited).toBe(1);
  });

  it('calls the latest handler without registering again', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const hook = await renderHook(({ fn }: { fn: () => void }) => useHardwareBack(fn), {
      initialProps: { fn: first },
    });
    await act(async () => hook.rerender({ fn: second }));
    await pressBack();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);
  });
});
