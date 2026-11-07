import { CRACK_GAP_PX } from '@habit-tracker/core';

// Where things sit in a streak chain, shared by the still chain and the animated one.
export const CHAIN_NODE = 14;
export const CHAIN_HEIGHT = 24;
export const CHAIN_MID = CHAIN_HEIGHT / 2;
const LINK_INSET = 3;
// A gap whose repair day has passed is wider than a fresh crack, and has no notch.
const QUIET_GAP_PX = 6;

export function nodeCentres(count: number, width: number): number[] {
  if (count <= 1) return [CHAIN_NODE / 2];
  const step = (width - CHAIN_NODE) / (count - 1);
  return Array.from({ length: count }, (_, i) => CHAIN_NODE / 2 + i * step);
}

export interface LinkSpan {
  from: number;
  to: number;
  mid: number;
}

export function linkSpan(left: number, right: number): LinkSpan {
  const from = left + CHAIN_NODE / 2 + LINK_INSET;
  const to = right - CHAIN_NODE / 2 - LINK_INSET;
  return { from, to, mid: (from + to) / 2 };
}

const y = CHAIN_MID;

// The two halves of a broken link. `apart` is how far each half has eased back.
export const halfLeft = ({ from, mid }: LinkSpan, apart: number) => `M${from} ${y}H${mid - apart}`;
export const halfRight = ({ to, mid }: LinkSpan, apart: number) => `M${mid + apart} ${y}H${to}`;
export const wholeLink = ({ from, to }: LinkSpan) => `M${from} ${y}H${to}`;

export const CRACK_APART = CRACK_GAP_PX / 2;
export const QUIET_APART = QUIET_GAP_PX / 2;

// A fine, uneven crack across the link, drawn top to bottom. Small, unequal steps keep
// it from reading as an arrow at this size.
export const crackPath = ({ mid }: LinkSpan) =>
  `M${mid - 0.5} ${y - 7}L${mid + 1.2} ${y - 4}L${mid - 0.6} ${y - 1.5}L${mid + 0.9} ${y + 1}L${mid - 1.1} ${y + 4}L${mid + 0.4} ${y + 7}`;
// Its length, for drawing it on with a dash offset.
export const CRACK_LENGTH = 17;

// The approved seam, laid across the link: three short stitches.
export const stitchesPath = ({ mid }: LinkSpan) =>
  [-4, 0, 4].map((dx) => `M${mid + dx} ${y - 3.5}V${y + 3.5}`).join('');

// Room after the last node for an ended chain's cap, and the cap itself: a short upright
// bar, like the end of a line of writing.
export const CHAIN_CAP_SPACE = 10;
export const endCapPath = (lastCentre: number) => {
  const x = lastCentre + CHAIN_NODE / 2 + 5;
  return `M${x} ${CHAIN_MID - 5}V${CHAIN_MID + 5}`;
};

// Node centres, leaving the cap its room when the chain has ended.
export const chainCentres = (count: number, width: number, ended = false) =>
  nodeCentres(count, ended ? Math.max(0, width - CHAIN_CAP_SPACE) : width);

// A day below the minimum: a small dot in the hollow node, larger the further it got.
// In the node's own 28-unit drawing space.
export const partialRadius = (share: number) => 3 + 5 * Math.min(1, Math.max(0, share));
