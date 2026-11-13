import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useMotionSettings } from '../chain/useMotionSettings';
import { Tab } from './TabBar';

const ORDER: Tab[] = ['today', 'progress', 'you'];
// Past a quarter of the screen, or a quick flick, and it goes to the next page.
const TURN_SHARE = 0.25;
const TURN_SPEED = 0.5;
// Past the first or last page it gives a little, then springs back.
const EDGE_GIVE = 0.3;
const SLIDE_MS = 240;
const native = Platform.OS !== 'web';

// A screen with something laid over it, such as a habit's details, holds the pages still
// so a sideways swipe there stays with what's on top.
const PagerHold = createContext<() => () => void>(() => () => {});

export function useHoldPager(held: boolean) {
  const hold = useContext(PagerHold);
  useEffect(() => (held ? hold() : undefined), [held, hold]);
}

interface TabPagerProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  // Once a page has slid fully into view: the time for it to start any heavy work, so
  // nothing stalls the slide.
  onSettle?: (tab: Tab) => void;
  // Today, Progress and You, in that order.
  children: [React.ReactNode, React.ReactNode, React.ReactNode];
}

// The tabs side by side: swipe left for the next one, right for the one before. A swipe
// that something inside wants first, such as a card's skip or the date strip, keeps it.
export function TabPager({ tab, onChange, onSettle, children }: TabPagerProps) {
  const { width } = useWindowDimensions();
  const { reducedMotion } = useMotionSettings();
  const index = Math.max(0, ORDER.indexOf(tab));
  const [x] = useState(() => new Animated.Value(-index * width));
  const holds = useRef(0);
  // The page the pages are on, or sliding to. A swipe ending sets it straight away, before
  // React has caught up.
  const shown = useRef(index);
  const latest = useRef({ width, onChange, onSettle, reducedMotion });

  useEffect(() => {
    latest.current = { width, onChange, onSettle, reducedMotion };
  });

  const hold = useCallback(() => {
    holds.current += 1;
    return () => {
      holds.current -= 1;
    };
  }, []);

  // Slides on the UI thread, so a busy JavaScript thread can't make it stutter.
  const slideTo = useCallback(
    (page: number) => {
      shown.current = page;
      const { width: w, reducedMotion: still } = latest.current;
      const settle = () => latest.current.onSettle?.(ORDER[page]);
      if (still) {
        x.setValue(-page * w);
        settle();
        return;
      }
      Animated.timing(x, {
        toValue: -page * w,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: native,
      }).start(({ finished }) => finished && shown.current === page && settle());
    },
    [x]
  );

  // A tab tapped. A swipe has already started its own slide, which is left to finish.
  useEffect(() => {
    if (shown.current !== index) slideTo(index);
  }, [index, slideTo]);

  // The window resized: straight to the same page at the new width.
  const sizedFor = useRef(width);
  useEffect(() => {
    if (sizedFor.current === width) return;
    sizedFor.current = width;
    x.setValue(-shown.current * width);
  }, [width, x]);

  // The rule can't see that latest is only read inside gesture handlers, after render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        holds.current === 0 && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 2,
      onPanResponderGrant: () => x.stopAnimation(),
      onPanResponderMove: (_, { dx }) => {
        const at = shown.current;
        const pastEnd = (at === 0 && dx > 0) || (at === ORDER.length - 1 && dx < 0);
        x.setValue(-at * latest.current.width + (pastEnd ? dx * EDGE_GIVE : dx));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const at = shown.current;
        const w = latest.current.width;
        const forward = dx < -w * TURN_SHARE || (dx < 0 && vx < -TURN_SPEED);
        const backward = dx > w * TURN_SHARE || (dx > 0 && vx > TURN_SPEED);
        const next = Math.min(ORDER.length - 1, Math.max(0, forward ? at + 1 : backward ? at - 1 : at));
        // The slide starts first; the tab bar and the rest follow.
        slideTo(next);
        if (next !== at) latest.current.onChange(ORDER[next]);
      },
      onPanResponderTerminate: () => slideTo(shown.current),
      // Once the pages are moving, nothing inside takes the swipe back.
      onPanResponderTerminationRequest: () => false,
    })
  );

  return (
    <PagerHold.Provider value={hold}>
      <View style={styles.frame} testID="tab-pager" {...responder.panHandlers}>
        <Animated.View style={[styles.row, { width: width * ORDER.length, transform: [{ translateX: x }] }]}>
          {children.map((page, i) => (
            <View
              key={ORDER[i]}
              style={{ width }}
              // Only the page on screen is read out or reachable.
              accessibilityElementsHidden={i !== index}
              importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
              pointerEvents={i === index ? 'auto' : 'none'}
              testID={`page-${ORDER[i]}`}
            >
              {page}
            </View>
          ))}
        </Animated.View>
      </View>
    </PagerHold.Provider>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
});
