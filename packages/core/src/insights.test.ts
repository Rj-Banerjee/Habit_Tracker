import { describe, expect, it } from 'vitest';
import { insightActionLabel, insightConfirm } from './insights';

describe('insight actions', () => {
  it('name what the button does', () => {
    expect(insightActionLabel({ type: 'light_day', weekday: 3 })).toBe('Make Wednesdays lighter');
    expect(insightActionLabel({ type: 'move_time', time_of_day: 'evening' })).toBe('Move to the evening');
    expect(insightActionLabel({ type: 'change_target', target: 7 })).toBe('Set the target to 7');
    expect(insightActionLabel({ type: 'switch_per_week', per_week: 4 })).toBe('Switch to 4 times a week');
    expect(insightActionLabel({ type: 'add_reminder', reminder_time: '19:30' })).toBe('Move the reminder to 7:30pm');
    expect(insightActionLabel({ type: 'add_reminder', reminder_time: '08:00' })).toBe('Move the reminder to 8am');
  });

  it('say what will change before it does, and that the past stays', () => {
    expect(insightConfirm({ type: 'light_day', weekday: 3 }, 'Read')).toBe(
      "On Wednesdays, Read's minimum becomes the goal, from today on. Earlier days stay as they were."
    );
    expect(insightConfirm({ type: 'change_target', target: 7 }, 'Read')).toMatch(/Earlier days keep their target/);
  });
});
