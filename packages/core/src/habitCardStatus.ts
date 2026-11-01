export type HabitCardStatus =
  | 'due'
  | 'done'
  | 'doneMinimum'
  | 'skipped'
  | 'open'
  | 'missed'
  | 'repaired'
  | 'protected';

// Shown under the title and read by screen readers. No wording here blames the user.
export const statusLabels: Record<HabitCardStatus, string> = {
  due: 'Due today',
  done: 'Done',
  doneMinimum: 'Done, minimum version',
  skipped: 'Skipped',
  open: 'Not logged yet',
  missed: 'Not done',
  repaired: 'Repaired',
  protected: 'Protected by a Grace Day',
};
