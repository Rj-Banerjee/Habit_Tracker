import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VoiceHabit } from './api';
import { isUndoPhrase, matchSimplePhrase } from './voice';
import { SPOKEN_HABIT_NAMES, SPOKEN_PHRASES } from './voiceSpoken';

// The phone's own matcher, which Free uses with no AI, scored on every phrase in the
// backend's voice sets. It may let a phrase through to "didn't catch that", but it must never
// do something the person didn't mean.

const sets = join(__dirname, '../../../backend/tests');
const read = (name: string) => JSON.parse(readFileSync(join(sets, name), 'utf8'));
const tuned = read('voice_phrases.json');
const habits: VoiceHabit[] = tuned.habits;
const phrases: { group: string; heard: string; expect: string[] }[] = [
  ...tuned.phrases,
  ...read('voice_phrases_heldout.json').phrases,
  ...read('voice_phrases_partial.json').phrases,
];

const onThePhone = (heard: string): string | null => {
  if (isUndoPhrase(heard)) return 'undo_last';
  const action = matchSimplePhrase(heard, habits);
  return action ? `${action.intent}:${action.habit_id}` : null;
};

describe('the phone matcher on the voice sets', () => {
  const results = phrases.map((p) => ({ ...p, got: onThePhone(p.heard) }));
  const acted = results.filter((r) => r.got !== null);

  it('covers the whole set', () => {
    expect(phrases.length).toBeGreaterThanOrEqual(200);
  });

  it('never does something that was not meant', () => {
    const wrong = acted.filter((r) => !r.expect.includes(r.got as string));
    expect(wrong.map((r) => `${r.heard} -> ${r.got}`)).toEqual([]);
  });

  it('never acts on half of a sentence that asked for more than one thing', () => {
    const partial = acted.filter((r) => r.expect.length > 1);
    expect(partial.map((r) => r.heard)).toEqual([]);
  });

  it('handles the clear phrases it is meant for', () => {
    // Printed so a change in coverage shows up in the test output.
    console.log(`Phone matcher acted on ${acted.length} of ${phrases.length} phrases, all correctly.`);
    expect(acted.length).toBeGreaterThan(0);
  });
});

describe('the spoken test phrases', () => {
  const ids = new Set(habits.map((h) => h.id));

  it('has 200 or more, each with its own id', () => {
    expect(SPOKEN_PHRASES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(SPOKEN_PHRASES.map((p) => p.id)).size).toBe(SPOKEN_PHRASES.length);
  });

  it('only expects habits the scorer knows', () => {
    for (const p of SPOKEN_PHRASES) {
      for (const want of p.expect) {
        const habit = want.split(':')[1];
        if (habit) expect({ id: p.id, known: ids.has(habit) }).toEqual({ id: p.id, known: true });
      }
    }
  });

  it('asks in Hindi only for Devanagari', () => {
    for (const p of SPOKEN_PHRASES) {
      expect({ id: p.id, language: p.language }).toEqual({
        id: p.id,
        language: /[ऀ-ॿ]/.test(p.say) ? 'hi-IN' : 'en-IN',
      });
    }
  });

  it('hints the same habit names the scorer uses', () => {
    const names = habits.flatMap((h) => [h.title, ...h.voice_aliases]);
    expect([...SPOKEN_HABIT_NAMES].sort()).toEqual([...names].sort());
  });
});
