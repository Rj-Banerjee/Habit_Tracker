import type { TimeOfDay } from './api';

// Dragging a card on Today: where it would land, and how far everything else moves to
// make room. Pure, so the screen only measures and animates.

export interface DragSlot {
  key: string;
  // A section's title, a habit's card, or the space an empty section shows while dragging.
  kind: 'header' | 'card' | 'empty';
  time: TimeOfDay;
  top: number;
  height: number;
}

export interface DragTarget {
  time: TimeOfDay;
  // Where it goes among that section's other cards, top first.
  index: number;
  // How far each other slot moves from where it was laid out, by key.
  offsets: Record<string, number>;
  // How far the dragged card moves from where it was to where it lands.
  landing: number;
}

// slots are in screen order and include the card being dragged. `centre` is where the
// dragged card's middle is now; `gap` is the space between cards.
export function dragTarget(slots: DragSlot[], draggedKey: string, centre: number, gap: number): DragTarget | null {
  const from = slots.findIndex((slot) => slot.key === draggedKey);
  if (from < 0) return null;
  const room = slots[from].height + gap;

  // The others, laid out as if the dragged card were lifted out of the list.
  const others = slots
    .filter((slot) => slot.key !== draggedKey)
    .map((slot) => ({ ...slot, closed: slots.indexOf(slot) > from ? slot.top - room : slot.top }));

  // Every place it could go: before each card, or at the end of each section.
  const places: { time: TimeOfDay; index: number; at: number; before: number }[] = [];
  others.forEach((slot, i) => {
    const next = others[i + 1];
    const sectionEnds = !next || next.kind === 'header';
    if (slot.kind === 'card') {
      const index = others.slice(0, i).filter((s) => s.kind === 'card' && s.time === slot.time).length;
      places.push({ time: slot.time, index, at: slot.closed, before: i });
    }
    if (sectionEnds) {
      const cards = others.filter((s) => s.kind === 'card' && s.time === slot.time).length;
      places.push({ time: slot.time, index: cards, at: slot.closed + slot.height + gap, before: i + 1 });
    }
  });
  if (places.length === 0) return null;

  // The place whose top is nearest the top the dragged card now has.
  const top = centre - slots[from].height / 2;
  const best = places.reduce((a, b) => (Math.abs(b.at - top) < Math.abs(a.at - top) ? b : a));

  // Everything from that place down moves down to make room; the rest closes up.
  const offsets: Record<string, number> = {};
  others.forEach((slot, i) => {
    const shifted = slot.closed + (i >= best.before ? room : 0);
    offsets[slot.key] = shifted - slot.top;
  });
  return { time: best.time, index: best.index, offsets, landing: best.at - slots[from].top };
}

// The section's new order, top first, with the dragged habit in its place.
export function orderAfterDrop(sectionIds: string[], draggedId: string, index: number): string[] {
  const rest = sectionIds.filter((id) => id !== draggedId);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), draggedId, ...rest.slice(at)];
}
