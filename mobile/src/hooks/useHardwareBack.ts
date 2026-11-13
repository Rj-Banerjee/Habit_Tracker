import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

// There's no router, so each screen or overlay claims Android's back button while it's
// open. The newest listener runs first, so an overlay wins over the screen under it.
// Returning false from the handler lets back go on to the next listener (or the system).
export function useHardwareBack(handler: () => boolean | void, enabled = true) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    // BackHandler logs an error on web.
    if (Platform.OS === 'web' || !enabled) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => latest.current() !== false);
    return () => sub.remove();
  }, [enabled]);
}
