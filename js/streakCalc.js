// streakCalc.js - Computes streaks, percentages, leaderboard rankings, and summary statistics

/**
 * Calculates metrics for each daily habit for the specified calendar month
 */
export function calculateDailyHabitStats(habit, monthCalendar, completions) {
  const habitCompletions = completions[habit.id] || {};
  let completedCount = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  monthCalendar.days.forEach(dayObj => {
    const isDone = !!habitCompletions[dayObj.dateKey];
    if (isDone) {
      completedCount++;
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  });

  const goal = habit.goal || monthCalendar.daysInMonth;
  const percentage = goal > 0 ? (completedCount / goal) * 100 : 0;

  return {
    id: habit.id,
    name: habit.name,
    goal,
    count: completedCount,
    totalDays: monthCalendar.daysInMonth,
    percentage,
    percentageFormatted: percentage.toFixed(1) + '%',
    longestStreak
  };
}

/**
 * Calculates top 10 habits of the month sorted by completion percentage
 */
export function calculateTopHabits(dailyHabits, monthCalendar, completions) {
  const stats = dailyHabits.map(h => calculateDailyHabitStats(h, monthCalendar, completions));

  // Sort descending by percentage, then by count
  stats.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    return b.count - a.count;
  });

  const top10 = stats.slice(0, 10);
  const over100Count = stats.filter(s => s.percentage >= 100).length;

  let message = 'Keep up the great momentum! 🌟';
  if (over100Count > 0) {
    message = `Over 100% on ${over100Count} habit${over100Count > 1 ? 's' : ''} — keep going! 🚀`;
  } else if (stats.length > 0 && stats[0].percentage >= 80) {
    message = `Top habit is at ${stats[0].percentageFormatted} consistency! ✨`;
  }

  return {
    top10,
    over100Count,
    message
  };
}

/**
 * Calculates day-by-day stats across all daily habits for the month
 */
export function calculateMonthDailyProgress(dailyHabits, monthCalendar, completions) {
  const totalHabits = dailyHabits.length;
  let totalCompletions = 0;

  const daysStats = monthCalendar.days.map(dayObj => {
    let completedForDay = 0;
    dailyHabits.forEach(h => {
      if (completions[h.id] && completions[h.id][dayObj.dateKey]) {
        completedForDay++;
      }
    });

    totalCompletions += completedForDay;
    const pct = totalHabits > 0 ? Math.round((completedForDay / totalHabits) * 100) : 0;

    return {
      day: dayObj.day,
      letter: dayObj.letter,
      dateKey: dayObj.dateKey,
      weekIndex: dayObj.weekIndex,
      count: completedForDay,
      totalHabits,
      percentage: pct
    };
  });

  const totalPossible = monthCalendar.daysInMonth * totalHabits;
  const overallPercentage = totalPossible > 0 ? (totalCompletions / totalPossible) * 100 : 0;

  // Calculate per-week completion rates
  const weekStats = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
  [1, 2, 3, 4, 5].forEach(wIndex => {
    const weekDays = daysStats.filter(d => d.weekIndex === wIndex);
    const wCompletions = weekDays.reduce((acc, d) => acc + d.count, 0);
    const wPossible = weekDays.length * totalHabits;
    const wPct = wPossible > 0 ? (wCompletions / wPossible) * 100 : 0;

    weekStats[wIndex] = {
      days: weekDays,
      completions: wCompletions,
      possible: wPossible,
      percentage: wPct,
      percentageFormatted: wPct.toFixed(1) + '%'
    };
  });

  return {
    daysStats,
    totalCompletions,
    totalPossible,
    overallPercentage,
    overallPercentageFormatted: overallPercentage.toFixed(2) + '%',
    weekStats
  };
}

/**
 * Computes weekly habits checklist progress
 */
export function calculateWeeklyHabitsStats(weeklyHabits) {
  let total = 0;
  let completed = 0;
  const perWeek = {};

  [1, 2, 3, 4, 5].forEach(w => {
    const list = weeklyHabits[w] || [];
    const done = list.filter(item => item.completed).length;
    perWeek[w] = {
      total: list.length,
      completed: done,
      percentage: list.length > 0 ? Math.round((done / list.length) * 100) : 0
    };
    total += list.length;
    completed += done;
  });

  const incomplete = total - completed;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return {
    total,
    completed,
    incomplete,
    percentage,
    percentageFormatted: percentage.toFixed(1) + '%',
    perWeek
  };
}

/**
 * Computes monthly habits checklist progress
 */
export function calculateMonthlyHabitsStats(monthlyHabits) {
  const total = monthlyHabits.length;
  const completed = monthlyHabits.filter(m => m.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    percentage,
    percentageFormatted: percentage + '%'
  };
}
