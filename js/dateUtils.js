// dateUtils.js - Calendar and date utility functions

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sunday = 0
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday = 0

/**
 * Returns formatted information about today's real-world date
 */
export function getTodayInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();
  const dayOfWeekIndex = (now.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday

  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;

  const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  const formatted = now.toLocaleDateString('en-US', options);

  return {
    year,
    month,
    day,
    dayOfWeek: WEEKDAY_LETTERS[dayOfWeekIndex],
    dateKey,
    formatted
  };
}

/**
 * Generates day objects for a given month & year, grouped into 5 weeks matching the design
 */
export function getMonthCalendar(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dayOfWeekIndex = (dateObj.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const letter = WEEKDAY_LETTERS[dayOfWeekIndex];
    const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;

    // Grouping by standard 7-day week chunks:
    // Week 1: 1-7, Week 2: 8-14, Week 3: 15-21, Week 4: 22-28, Week 5: 29-end
    let weekIndex = 1;
    if (d <= 7) weekIndex = 1;
    else if (d <= 14) weekIndex = 2;
    else if (d <= 21) weekIndex = 3;
    else if (d <= 28) weekIndex = 4;
    else weekIndex = 5;

    days.push({
      day: d,
      letter,
      dateKey,
      weekIndex
    });
  }

  // Group into weeks dictionary
  const weeks = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  days.forEach(d => {
    weeks[d.weekIndex].push(d);
  });

  return {
    year,
    month,
    monthName: MONTH_NAMES[month],
    daysInMonth,
    days,
    weeks
  };
}
