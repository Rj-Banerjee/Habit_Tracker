// store.js - State management and local storage persistence

const STORAGE_KEY = 'aesthetic_habit_tracker_v1';

// Initial pre-seeded demo state representing June 2026 from the screenshots
const DEFAULT_DAILY_HABITS = [
  { id: 'h1', name: 'Review class notes', goal: 30 },
  { id: 'h2', name: 'Complete assignments', goal: 30 },
  { id: 'h3', name: 'Organize study desk', goal: 30 },
  { id: 'h4', name: 'Read 10 pages of a book', goal: 30 },
  { id: 'h5', name: 'Exercise for 30 minutes', goal: 31 },
  { id: 'h6', name: 'Drink 8 glasses of water', goal: 30 },
  { id: 'h7', name: 'Plan next day\'s schedule', goal: 31 },
  { id: 'h8', name: 'Meditate for 10 minutes', goal: 31 },
  { id: 'h9', name: 'Check emails and updates', goal: 31 },
  { id: 'h10', name: 'Practice language skills', goal: 31 },
  { id: 'h11', name: 'Review flashcards', goal: 31 },
  { id: 'h12', name: 'Write in a journal', goal: 31 },
  { id: 'h13', name: 'Solve 3 practice problems', goal: 31 },
  { id: 'h14', name: 'Connect with a classmate', goal: 31 },
  { id: 'h15', name: 'Watch an educational video', goal: 31 },
  { id: 'h16', name: 'Take a 15-minute walk', goal: 20 },
  { id: 'h17', name: 'Get at least 7 hours of sleep', goal: 22 },
  { id: 'h18', name: 'Healthy nutritious breakfast', goal: 30 },
  { id: 'h19', name: 'Evening wind-down & stretch', goal: 30 }
];

// Pre-seeded day completions for June 2026 matching the screenshot statistics exactly
function generateDefaultCompletions() {
  const pad = (n) => String(n).padStart(2, '0');
  const completions = {}; // habitId -> { '2026-06-DD': boolean }

  const daysPatterns = {
    h1: [1, 4, 8, 11, 14, 15, 17, 18, 22, 28, 29, 7, 2, 9, 21], // 15 days
    h2: [1, 2, 3, 4, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 22, 23, 25, 27, 29, 30, 6, 20], // 22 days
    h3: [1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24, 25, 28, 29, 30, 7], // 23 days
    h4: [1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29, 30, 20], // 25 days
    h5: [1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30], // 26 days
    h6: [2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 26 days
    h7: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29], // 27 days
    h8: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 29 days
    h9: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 30 days
    h10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29], // 28 days
    h11: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30], // 29 days
    h12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30], // 29 days
    h13: [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30], // 25 days
    h14: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29], // 25 days
    h15: [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 21, 23, 25, 26, 28, 29], // 21 days
    h16: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 30 days (150.0% of 20)
    h17: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29], // 29 days (131.8% of 22)
    h18: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 15, 16, 18, 19, 22, 23], // 17 days
    h19: [1, 2, 3, 5, 8, 9, 15, 16, 22, 23] // 10 days
  };

  DEFAULT_DAILY_HABITS.forEach(h => {
    completions[h.id] = {};
    const activeDays = daysPatterns[h.id] || [];
    activeDays.forEach(day => {
      const dateKey = `2026-06-${pad(day)}`;
      completions[h.id][dateKey] = true;
    });
  });

  return completions;
}

const DEFAULT_WEEKLY_HABITS = {
  1: [
    { id: 'w1_1', text: 'Back up important files', completed: true },
    { id: 'w1_2', text: 'Deep clean study area', completed: true },
    { id: 'w1_3', text: 'Submit weekly assignments', completed: true },
    { id: 'w1_4', text: 'Review last week\'s lectures', completed: false }
  ],
  2: [
    { id: 'w2_1', text: 'Plan weekly finances', completed: false },
    { id: 'w2_2', text: 'Do a weekly workout review', completed: true },
    { id: 'w2_3', text: 'Meal prep for the week', completed: true },
    { id: 'w2_4', text: 'Check in with a loved one', completed: false },
    { id: 'w2_5', text: 'Take a walk outdoors', completed: false }
  ],
  3: [
    { id: 'w3_1', text: 'Organize weekly planner', completed: true },
    { id: 'w3_2', text: 'Complete one hobby project', completed: true },
    { id: 'w3_3', text: 'Call or meet family/friends', completed: true }
  ],
  4: [
    { id: 'w4_1', text: 'Plan weekly finances', completed: true },
    { id: 'w4_2', text: 'Meal prep for the week', completed: false },
    { id: 'w4_3', text: 'Do a weekly workout review', completed: true },
    { id: 'w4_4', text: 'Check in with a loved one', completed: true },
    { id: 'w4_5', text: 'Take a walk outdoors', completed: true }
  ],
  5: [
    { id: 'w5_1', text: 'Plan weekly finances', completed: false },
    { id: 'w5_2', text: 'Have a screen free evening', completed: true },
    { id: 'w5_3', text: 'Meal prep for the week', completed: true },
    { id: 'w5_4', text: 'Do a weekly workout review', completed: true }
  ]
};

const DEFAULT_MONTHLY_HABITS = [
  { id: 'm1', text: 'Reflect on academic progress', completed: false },
  { id: 'm2', text: 'Update long-term goals', completed: true },
  { id: 'm3', text: 'Meet with academic advisor', completed: true },
  { id: 'm4', text: 'Pay bills and check finances', completed: false }
];

const DEFAULT_REFLECTION = `This month, I felt more present in my creative practice.
Guiding my students through mindful drawing sessions
reminded me to slow down and notice the small details.
I stayed consistent with my morning sketching,
though I want to bring more playfulness
into my personal work next month.
I'm proud of how I showed up
— gently, intentionally, and with curiosity.`;

export function getInitialState() {
  const now = new Date();
  return {
    selectedYear: 2026,
    selectedMonth: 5, // June (0-indexed)
    dailyHabits: [...DEFAULT_DAILY_HABITS],
    completions: generateDefaultCompletions(),
    weeklyHabits: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_HABITS)),
    monthlyHabits: JSON.parse(JSON.stringify(DEFAULT_MONTHLY_HABITS)),
    reflection: DEFAULT_REFLECTION
  };
}

export class HabitStore {
  constructor() {
    this.state = this.load();
    this.subscribers = [];
  }

  load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          ...getInitialState(),
          ...parsed
        };
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
    }
    return getInitialState();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
    this.notify();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.subscribers.forEach(cb => cb(this.state));
  }

  getState() {
    return this.state;
  }

  // --- Date actions ---
  setDate(year, month) {
    this.state.selectedYear = year;
    this.state.selectedMonth = month;
    this.save();
  }

  // --- Daily habits actions ---
  toggleDailyCompletion(habitId, dateKey) {
    if (!this.state.completions[habitId]) {
      this.state.completions[habitId] = {};
    }
    const current = !!this.state.completions[habitId][dateKey];
    if (current) {
      delete this.state.completions[habitId][dateKey];
    } else {
      this.state.completions[habitId][dateKey] = true;
    }
    this.save();
  }

  addDailyHabit(name, goal = 30) {
    const id = 'h_' + Date.now();
    this.state.dailyHabits.push({ id, name, goal: Number(goal) || 30 });
    this.state.completions[id] = {};
    this.save();
    return id;
  }

  updateDailyHabit(id, name, goal) {
    const habit = this.state.dailyHabits.find(h => h.id === id);
    if (habit) {
      if (name !== undefined) habit.name = name;
      if (goal !== undefined) habit.goal = Number(goal) || 30;
      this.save();
    }
  }

  deleteDailyHabit(id) {
    this.state.dailyHabits = this.state.dailyHabits.filter(h => h.id !== id);
    delete this.state.completions[id];
    this.save();
  }

  // --- Weekly habits actions ---
  toggleWeeklyHabit(weekNum, habitId) {
    const habits = this.state.weeklyHabits[weekNum];
    if (habits) {
      const habit = habits.find(h => h.id === habitId);
      if (habit) {
        habit.completed = !habit.completed;
        this.save();
      }
    }
  }

  addWeeklyHabit(weekNum, text) {
    if (!this.state.weeklyHabits[weekNum]) {
      this.state.weeklyHabits[weekNum] = [];
    }
    const id = `w${weekNum}_` + Date.now();
    this.state.weeklyHabits[weekNum].push({ id, text, completed: false });
    this.save();
  }

  deleteWeeklyHabit(weekNum, habitId) {
    if (this.state.weeklyHabits[weekNum]) {
      this.state.weeklyHabits[weekNum] = this.state.weeklyHabits[weekNum].filter(h => h.id !== habitId);
      this.save();
    }
  }

  // --- Monthly habits actions ---
  toggleMonthlyHabit(habitId) {
    const habit = this.state.monthlyHabits.find(h => h.id === habitId);
    if (habit) {
      habit.completed = !habit.completed;
      this.save();
    }
  }

  addMonthlyHabit(text) {
    const id = 'm_' + Date.now();
    this.state.monthlyHabits.push({ id, text, completed: false });
    this.save();
  }

  deleteMonthlyHabit(habitId) {
    this.state.monthlyHabits = this.state.monthlyHabits.filter(h => h.id !== habitId);
    this.save();
  }

  // --- Reflection actions ---
  setReflection(text) {
    this.state.reflection = text;
    this.save();
  }

  // --- Reset & Import/Export ---
  resetToDemo() {
    this.state = getInitialState();
    this.save();
  }

  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && Array.isArray(parsed.dailyHabits)) {
        this.state = parsed;
        this.save();
        return true;
      }
    } catch (e) {
      console.error('Import error:', e);
    }
    return false;
  }
}
