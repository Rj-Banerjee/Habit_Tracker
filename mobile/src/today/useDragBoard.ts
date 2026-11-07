import { useState } from 'react';
import { Animated, Platform } from 'react-native';
import { DragSlot, dragTarget, DragTarget, TimeOfDay } from '@habit-tracker/core';

// A soft spring with a little bounce, for the cards making room and the card landing.
const BOUNCE = { friction: 7, tension: 140, useNativeDriver: Platform.OS !== 'web' };

interface Placed {
  kind: DragSlot['kind'];
  time: TimeOfDay;
  y: number;
  height: number;
}

// The sections of Today while a card is dragged: where each header and card sits, how far
// each has moved to make room, and where the dragged card would land.
export function useDragBoard(gap: number) {
  // Held in state so they last, and changed in place: measuring and animating never
  // needs a render.
  const [offsets] = useState(() => new Map<string, Animated.Value>());
  const [placed] = useState(() => new Map<string, Placed>());
  const [sectionTops] = useState(() => new Map<TimeOfDay, number>());
  const [aimed] = useState(() => new Map<string, number>());
  const [dragged, setDragged] = useState<string | null>(null);

  const offsetOf = (key: string) => {
    let value = offsets.get(key);
    if (!value) {
      value = new Animated.Value(0);
      offsets.set(key, value);
    }
    return value;
  };

  const placeSection = (time: TimeOfDay, y: number) => sectionTops.set(time, y);
  const place = (key: string, slot: Placed) => placed.set(key, slot);

  const slots = (order: string[]): DragSlot[] =>
    order.flatMap((key) => {
      const slot = placed.get(key);
      if (!slot) return [];
      return [{ key, kind: slot.kind, time: slot.time, height: slot.height, top: (sectionTops.get(slot.time) ?? 0) + slot.y }];
    });

  const springTo = (key: string, to: number, then?: () => void) => {
    if (aimed.get(key) === to && !then) return;
    aimed.set(key, to);
    Animated.spring(offsetOf(key), { toValue: to, ...BOUNCE }).start(then && (() => then()));
  };

  const targetFor = (key: string, dy: number, order: string[]): DragTarget | null => {
    const all = slots(order);
    const own = all.find((slot) => slot.key === key);
    if (!own) return null;
    return dragTarget(all, key, own.top + own.height / 2 + dy, gap);
  };

  const start = (key: string) => {
    aimed.clear();
    setDragged(key);
  };

  // The dragged card follows the finger; the others make room as it passes.
  const move = (key: string, dy: number, order: string[]) => {
    offsetOf(key).setValue(dy);
    const target = targetFor(key, dy, order);
    if (!target) return;
    for (const [other, to] of Object.entries(target.offsets)) springTo(other, to);
  };

  // It settles into its place, then the new order is saved and drawn.
  const drop = (key: string, dy: number, order: string[], onLand: (target: DragTarget | null) => void) => {
    const target = targetFor(key, dy, order);
    if (!target) {
      cancel();
      onLand(null);
      return;
    }
    springTo(key, target.landing, () => onLand(target));
  };

  const cancel = () => {
    for (const key of offsets.keys()) springTo(key, 0);
    setDragged(null);
  };

  // Once the new order has been drawn, everything is where it belongs with no offset.
  const settle = () => {
    for (const value of offsets.values()) value.setValue(0);
    aimed.clear();
    setDragged(null);
  };

  return { dragged, offsetOf, placeSection, place, start, move, drop, cancel, settle };
}

export type DragBoard = ReturnType<typeof useDragBoard>;
