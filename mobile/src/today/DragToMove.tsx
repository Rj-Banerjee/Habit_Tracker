import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, Platform } from 'react-native';
import { space } from '@habit-tracker/core';
import { useTheme } from '@habit-tracker/ui';

// How far a held card moves before it's a drag rather than a long press.
const DRAG_DISTANCE = 12;
const LIFTED_SCALE = 1.03;
const native = Platform.OS !== 'web';

interface DragToMoveProps {
  // Set once the card has been long-pressed: only then does moving the finger drag it.
  armed: boolean;
  // Where it is drawn from where it was laid out: the finger's travel while dragged, or
  // the room it makes for another card.
  offset: Animated.Value;
  onLayout: (y: number, height: number) => void;
  onDragStart: () => void;
  onMove: (dy: number) => void;
  onDrop: (dy: number) => void;
  onCancel: () => void;
  // The finger lifted without dragging.
  onDisarm: () => void;
  children: React.ReactNode;
}

// Hold a card, then move it up or down: it lifts, follows the finger, and the other cards
// make room with a soft bounce. Letting go lands it there.
export function DragToMove({
  armed,
  offset,
  onLayout,
  onDragStart,
  onMove,
  onDrop,
  onCancel,
  onDisarm,
  children,
}: DragToMoveProps) {
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ armed, onDragStart, onMove, onDrop, onCancel, onDisarm });

  useEffect(() => {
    latest.current = { armed, onDragStart, onMove, onDrop, onCancel, onDisarm };
  });

  // The rule can't see that latest is only read inside gesture handlers, after render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const lift = (to: number) => Animated.spring(scale, { toValue: to, friction: 6, tension: 160, useNativeDriver: native }).start();
    return PanResponder.create({
      // Taken from the card underneath, but only once it's been held and moves up or down.
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        latest.current.armed && Math.abs(dy) > DRAG_DISTANCE && Math.abs(dy) > Math.abs(dx),
      onPanResponderGrant: () => {
        setDragging(true);
        lift(LIFTED_SCALE);
        latest.current.onDragStart();
      },
      onPanResponderMove: (_, { dy }) => latest.current.onMove(dy),
      onPanResponderRelease: (_, { dy }) => {
        setDragging(false);
        lift(1);
        latest.current.onDrop(dy);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        lift(1);
        latest.current.onCancel();
      },
    });
  });

  return (
    <Animated.View
      onLayout={(event: LayoutChangeEvent) => onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      style={[
        { transform: [{ translateY: offset }, { scale }] },
        dragging && { zIndex: 1, shadowColor: colors.text, shadowOpacity: 0.15, shadowRadius: space.sm, elevation: 6 },
      ]}
      {...responder.panHandlers}
      // Letting go after a long press without moving ends it, so a later scroll over the
      // card isn't taken for a drag.
      onTouchEnd={() => {
        if (!dragging) latest.current.onDisarm();
      }}
    >
      {children}
    </Animated.View>
  );
}

// A section title or an empty section's line: not draggable, but moves aside for a card.
export function DragSpacer({
  offset,
  onLayout,
  children,
}: {
  offset: Animated.Value;
  onLayout: (y: number, height: number) => void;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      onLayout={(event: LayoutChangeEvent) => onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      style={{ transform: [{ translateY: offset }] }}
    >
      {children}
    </Animated.View>
  );
}
