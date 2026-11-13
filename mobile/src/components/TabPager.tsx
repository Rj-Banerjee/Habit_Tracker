import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useMotionSettings } from '../chain/useMotionSettings';
import { Tab } from './TabBar';

const ORDER: Tab[] = ['today', 'progress', 'you'];
// Past a quarter of the screen, or a quick flick, and it goes to the next page.
const TURN_SHARE = 0.25;
const TURN_SPEED = 0.5;
// Past the first or last page it gives a little, then springs back.
const EDGE_GIVE = 0.3;

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
  // Today, Progress and You, in that order.
  children: [React.ReactNode, React.ReactNode, React.ReactNode];
}

// The tabs side by side: swipe left for the next one, right for the one before. A swipe
// that something inside wants first, such as a card's skip or the date strip, keeps it.
export function TabPager({ tab, onChange, children }: TabPagerProps) {
  const { width } = useWindowDimensions();
  const { reducedMotion } = useMotionSettings();
  const index = Math.max(0, ORDER.indexOf(tab));
  const [x] = useState(() => new Animated.Value(-index * width));
  const holds = useRef(0);
  const latest = useRef({ index, width, onChange, reducedMotion });

  useEffect(() => {
    latest.current = { index, width, onChange, reducedMotion };
  });

  const hold = useCallback(() => {
    holds.current += 1;
    return () => {
      holds.current -= 1;
    };
  }, []);

  // To the page, from a tab tap or the end of a swipe.
  useEffect(() => {
    const to = -index * width;
    if (reducedMotion) {
      x.setValue(to);
      return;
    }
    Animated.spring(x, {
      toValue: to,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 0,
    }).start();
  }, [index, width, reducedMotion, x]);

  // The rule can't see that latest is only read inside gesture handlers, after render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const back = () => {
      const { index: at, width: w, reducedMotion: still } = latest.current;
      if (still) return x.setValue(-at * w);
      Animated.spring(x, { toValue: -at * w, useNativeDriver: Platform.OS !== 'web', speed: 20, bounciness: 0 }).start();
    };

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        holds.current === 0 && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 2,
      onPanResponderGrant: () => x.stopAnimation(),
      onPanResponderMove: (_, { dx }) => {
        const { index: at, width: w } = latest.current;
        const pastEnd = (at === 0 && dx > 0) || (at === ORDER.length - 1 && dx < 0);
        x.setValue(-at * w + (pastEnd ? dx * EDGE_GIVE : dx));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const { index: at, width: w, onChange: go } = latest.current;
        const forward = dx < -w * TURN_SHARE || (dx < 0 && vx < -TURN_SPEED);
        const backward = dx > w * TURN_SHARE || (dx > 0 && vx > TURN_SPEED);
        const next = forward ? at + 1 : backward ? at - 1 : at;
        if (next !== at && next >= 0 && next < ORDER.length) go(ORDER[next]);
        else back();
      },
      onPanResponderTerminate: back,
      // Once the pages are moving, nothing inside takes the swipe back.
      onPanResponderTerminationRequest: () => false,
    });
  });

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
