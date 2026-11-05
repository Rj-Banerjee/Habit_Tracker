import type { DayStatus, HabitLevel, HabitType, ProgressDay } from './api';
import { dayCellStatus, dayName } from './dates';
import type { HabitCardStatus } from './habitCardStatus';

// The streak chain: one node per scheduled day, joined by links. A link takes its look
// from the day it leads into, so a crack sits between the last done day and the miss.
export type LinkKind = 'chain' | 'pending' | 'crack' | 'gap' | 'seam';

export interface ChainNode {
  date: string;
  status: HabitCardStatus;
  // A closed miss that can still be repaired, and on which day.
  repairOn: string | null;
  // A repaired miss: the day the extra work was done, and how much.
  repairedWith: { on: string; amount: number | null } | null;
}

export interface Chain {
  nodes: ChainNode[];
  // links[i] joins nodes[i] and nodes[i + 1].
  links: LinkKind[];
}

export interface ChainLog {
  date: string;
  level_done: HabitLevel | null;
  amount?: number | null;
}

export const CHAIN_DAYS = 7;

function linkInto(node: ChainNode): LinkKind {
  switch (node.status) {
    case 'missed':
      return node.repairOn ? 'crack' : 'gap';
    case 'repaired':
      return 'seam';
    case 'due':
    case 'open':
      return 'pending';
    default:
      return 'chain';
  }
}

// The most recent scheduled days up to today, oldest first.
export function buildChain(
  statuses: DayStatus[],
  logs: ChainLog[],
  today: string,
  days = CHAIN_DAYS
): Chain {
  const logOn = new Map(logs.map((log) => [log.date, log]));
  const scheduled = [...statuses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((day) => {
      const status = dayCellStatus(day.status, logOn.get(day.date)?.level_done, day.date, today);
      return status ? [{ day, status }] : [];
    });

  const all: ChainNode[] = scheduled.map(({ day, status }, index) => {
    // The extra work for a repair is logged on the next scheduled day.
    const next = status === 'repaired' ? scheduled[index + 1] : undefined;
    return {
      date: day.date,
      status,
      repairOn: status === 'missed' ? day.repair_on : null,
      repairedWith: next
        ? { on: next.day.date, amount: logOn.get(next.day.date)?.amount ?? null }
        : null,
    };
  });

  const nodes = all.slice(-days);
  return { nodes, links: nodes.slice(1).map(linkInto) };
}

// One habit's chain from the day rows Progress already loads. `statuses` adds the repair
// day for a miss that can still be repaired, and can be left out where that isn't known.
export function habitChain(
  habitId: string,
  days: ProgressDay[],
  today: string,
  count = CHAIN_DAYS,
  statuses: DayStatus[] = []
): Chain {
  const repairOn = new Map(
    statuses.filter((s) => s.habit_id === habitId).map((s) => [s.date, s.repair_on])
  );
  const own = days.filter((day) => day.habit_id === habitId);
  return buildChain(
    own.map((day) => ({ habit_id: habitId, date: day.date, status: day.status, repair_on: repairOn.get(day.date) ?? null })),
    own,
    today,
    count
  );
}

// ---------------------------------------------------------------------------
// Which moment to play, and when
// ---------------------------------------------------------------------------

export type MomentKind = 'fracture' | 'weld' | 'protected';

export interface Moment {
  kind: MomentKind;
  habitId: string;
  date: string;
}

export const momentKey = (moment: Moment) => `${moment.kind}:${moment.habitId}:${moment.date}`;

export interface MomentPlan {
  // At most one per habit, played the next time it's on screen.
  play: Moment[];
  // Several things changed while they were away: one calm summary instead.
  welcomeBack: Moment[];
  // Seen without playing: a miss whose repair day has passed, or everything that was
  // already there the first time the app looked.
  quiet: string[];
}

const PRIORITY: Record<MomentKind, number> = { weld: 0, fracture: 1, protected: 2 };

// `seen` is null the first time, so a chain that existed before this feature, or on a
// fresh install, never plays its history.
export function planMoments(
  chains: { habitId: string; chain: Chain }[],
  seen: ReadonlySet<string> | null
): MomentPlan {
  const candidates: Moment[] = [];
  const quiet: string[] = [];

  for (const { habitId, chain } of chains) {
    for (const node of chain.nodes) {
      const kind: MomentKind | null =
        node.status === 'repaired'
          ? 'weld'
          : node.status === 'protected'
            ? 'protected'
            : node.status === 'missed'
              ? 'fracture'
              : null;
      if (!kind) continue;
      const moment = { kind, habitId, date: node.date };
      const key = momentKey(moment);
      if (seen?.has(key)) continue;
      // A crack whose repair day has gone settles into a quiet gap, with no animation.
      if (!seen || (kind === 'fracture' && !node.repairOn)) quiet.push(key);
      else candidates.push(moment);
    }
  }

  const perHabit = new Map<string, Moment>();
  for (const moment of candidates) {
    const current = perHabit.get(moment.habitId);
    const better =
      !current ||
      PRIORITY[moment.kind] < PRIORITY[current.kind] ||
      (PRIORITY[moment.kind] === PRIORITY[current.kind] && moment.date > current.date);
    if (better) perHabit.set(moment.habitId, moment);
  }
  // Older moments on the same habit are covered by the one that plays.
  const playing = [...perHabit.values()];
  const covered = candidates.filter((m) => !playing.includes(m)).map(momentKey);

  const misses = playing.filter((m) => m.kind !== 'weld').length;
  const welds = playing.length - misses;
  if (misses >= 2 || (misses >= 1 && welds >= 1)) {
    return { play: [], welcomeBack: playing, quiet: [...quiet, ...covered] };
  }
  return { play: playing, welcomeBack: [], quiet: [...quiet, ...covered] };
}

// The chain as it looked just before a moment, which the animation starts from.
export function chainBefore(chain: Chain, moment: Moment): Chain {
  const index = chain.nodes.findIndex((node) => node.date === moment.date);
  if (index < 0 || moment.kind === 'protected') return chain;
  const nodes = [...chain.nodes];
  const links = [...chain.links];
  if (moment.kind === 'fracture') {
    nodes[index] = { ...nodes[index], status: 'open', repairOn: null };
    if (index > 0) links[index - 1] = 'chain';
  } else {
    nodes[index] = { ...nodes[index], status: 'missed', repairedWith: null, repairOn: nodes[index].repairedWith?.on ?? null };
    if (index > 0) links[index - 1] = 'crack';
  }
  return { nodes, links };
}

// A long chain in rows, so its nodes never crowd. Links across a row break are dropped.
export function chainRows(chain: Chain, perRow: number): Chain[] {
  const rows: Chain[] = [];
  for (let start = 0; start < chain.nodes.length; start += perRow) {
    const nodes = chain.nodes.slice(start, start + perRow);
    rows.push({ nodes, links: chain.links.slice(start, start + nodes.length - 1) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export interface RepairHabit {
  title: string;
  type: HabitType;
  target: number | null;
  unit: string | null;
}

export const fractureCaption = (missed: string, repairOn: string | null) =>
  repairOn
    ? `Cracked on ${dayName(missed)} · Repair on ${dayName(repairOn)}`
    : `Cracked on ${dayName(missed)}`;

const hasTarget = (habit: RepairHabit) =>
  (habit.type === 'count' || habit.type === 'duration') && habit.target !== null;

export const repairAmount = (target: number) => Math.ceil(target * 1.5);

export function repairHint(habit: RepairHabit, repairOn: string) {
  if (!hasTarget(habit)) return `Do the full and minimum versions on ${dayName(repairOn)}`;
  const amount = [repairAmount(habit.target as number), habit.unit].filter(Boolean).join(' ');
  return `${habit.title} ${amount} on ${dayName(repairOn)}`;
}

export const weldCaption = (streak: number) => `Welded. ${streak}-day streak.`;

export const PROTECTED_CAPTION = 'A Grace Day kept your streak safe.';

export function seamLabel(node: ChainNode, habit: RepairHabit) {
  if (!node.repairedWith) return 'Repaired';
  const on = dayName(node.repairedWith.on);
  const { amount } = node.repairedWith;
  if (hasTarget(habit) && amount !== null) {
    return `Repaired on ${on} with ${[amount, habit.unit?.toLowerCase()].filter(Boolean).join(' ')}`;
  }
  return `Repaired on ${on} with the full and minimum versions`;
}

export const WELCOME_BACK_TITLE = "Welcome back. Here's where things stand.";

// ---------------------------------------------------------------------------
// Timing, in milliseconds. Each phase is [start, end].
// ---------------------------------------------------------------------------

export const FRACTURE_MS = { crack: [0, 180], part: [120, 340], caption: [340, 600], total: 600 } as const;
export const WELD_MS = {
  join: [0, 220],
  bead: [150, 550],
  sparks: [300, 550],
  seam: [550, 900],
  total: 900,
} as const;
export const PROTECTED_MS = { shimmer: [0, 300], total: 300 } as const;
export const CROSSFADE_MS = 150;
export const WELD_CAPTION_MS = 2000;
// How far the two segments part at a crack.
export const CRACK_GAP_PX = 2.5;

export interface MotionSettings {
  reducedMotion: boolean;
  lowEnd: boolean;
  // 1 is normal speed; 4 plays at a quarter of the speed, for review.
  slow?: number;
}

export interface MotionPlan {
  mode: 'full' | 'crossfade';
  sparks: boolean;
  durationMs: number;
}

const TOTAL: Record<MomentKind, number> = {
  fracture: FRACTURE_MS.total,
  weld: WELD_MS.total,
  protected: PROTECTED_MS.total,
};

export function motionPlan(kind: MomentKind, settings: MotionSettings): MotionPlan {
  const slow = settings.slow ?? 1;
  if (settings.reducedMotion) {
    return { mode: 'crossfade', sparks: false, durationMs: CROSSFADE_MS * slow };
  }
  return {
    mode: 'full',
    sparks: kind === 'weld' && !settings.lowEnd,
    durationMs: TOTAL[kind] * slow,
  };
}

// Below this much memory a phone skips the sparks. Phones report a little less than
// they're sold with, so a 3 GB phone counts.
export const LOW_END_MEMORY_BYTES = 3 * 1024 ** 3;
export const isLowEnd = (totalMemory: number | null | undefined) =>
  totalMemory !== null && totalMemory !== undefined && totalMemory < LOW_END_MEMORY_BYTES;

// What each repaired day says when hovered or held, by date.
export function seamLabels(
  statuses: DayStatus[],
  logs: ChainLog[],
  habit: RepairHabit,
  today: string
): Map<string, string> {
  const { nodes } = buildChain(statuses, logs, today, Number.POSITIVE_INFINITY);
  return new Map(
    nodes.filter((node) => node.status === 'repaired').map((node) => [node.date, seamLabel(node, habit)])
  );
}
