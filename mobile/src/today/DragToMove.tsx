import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';
import { space } from '@habit-tracker/core';
import { useTheme } from '@habit-tracker/ui';

// How far a held card moves before it's a drag rather than a long press.
const DRAG_DISTANCE = 12;

interface DragToMoveProps {
  // Set once the card has been long-pressed: only then does moving the finger drag it.
  armed: boolean;
  onDragStart: () => void;
  // Where the finger let go, on screen.
  onDrop: (pageY: number) => void;
  onCancel: () => void;
  children: React.ReactNode;
}

// Long-press a card, then move it up or down to another part of the day. "Move to…" in
// the long-press sheet does the same without dragging, so this is never the only way.
export function DragToMove({ armed, onDragStart, onDrop, onCancel, children }: DragToMoveProps) {
  const { colors } = useTheme();
  const [offset] = useState(() => new Animated.Value(0));
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ armed, onDragStart, onDrop, onCancel });

  useEffect(() => {
    latest.current = { armed, onDragStart, onDrop, onCancel };
  });

  // The rule can't see that latest is only read inside gesture handlers, after render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const settle = () =>
      Animated.timing(offset, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();

    return PanResponder.create({
      // Taken from the card underneath, but only once it's been held and moves up or down.
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        latest.current.armed && Math.abs(dy) > DRAG_DISTANCE && Math.abs(dy) > Math.abs(dx),
      onPanResponderGrant: () => {
        setDragging(true);
        latest.current.onDragStart();
      },
      onPanResponderMove: (_, { dy }) => offset.setValue(dy),
      onPanResponderRelease: (_, { moveY }) => {
        setDragging(false);
        offset.setValue(0);
        latest.current.onDrop(moveY);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        settle();
        latest.current.onCancel();
      },
    });
  });

  return (
    <Animated.View
      style={[
        { transform: [{ translateY: offset }] },
        dragging && { zIndex: 1, shadowColor: colors.text, shadowOpacity: 0.15, shadowRadius: space.sm, elevation: 4 },
      ]}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}
