import { useEffect } from 'react';
import { Platform, PressableStateCallbackType, useWindowDimensions } from 'react-native';
import { layout } from '@habit-tracker/core';

// react-native-web adds these to Pressable. Native leaves them undefined.
export type PressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

export type LayoutSize = 'compact' | 'wide' | 'desktop';

export function layoutSize(width: number): LayoutSize {
  if (width >= layout.breakpoints.desktop) return 'desktop';
  return width >= layout.breakpoints.wide ? 'wide' : 'compact';
}

export function useLayoutSize(): LayoutSize {
  return layoutSize(useWindowDimensions().width);
}

// A right click does what a long press does on a phone.
export function rightClick(handler?: () => void) {
  if (Platform.OS !== 'web' || !handler) return {};
  return {
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      handler();
    },
  };
}

// react-native-web ignores a right button press but still tracks its release,
// which logs a warning. Dropping that release lets right click act alone.
export function useRightClickGuard() {
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) event.stopPropagation();
    };

    window.addEventListener('mouseup', onMouseUp, true);
    return () => window.removeEventListener('mouseup', onMouseUp, true);
  }, []);
}

// A keyboard shortcut on web and desktop. It stays out of the way while typing.
export function useShortcut(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === key.toLowerCase()) {
        event.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, handler, enabled]);
}
