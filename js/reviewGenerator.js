// reviewGenerator.js - Generates an intelligent monthly reflection & progress review

/**
 * Synthesizes performance across daily, weekly, and monthly habits into a cohesive review
 */
export function generateMonthlyReview({
  monthName,
  year,
  dailyStats,
  topHabits,
  weeklyStats,
  monthlyStats
}) {
  const overallPct = dailyStats.overallPercentage.toFixed(1);
  const bestHabit = topHabits.top10[0] || { name: 'Daily Habits', percentageFormatted: '100%' };
  const longestStreakHabit = [...dailyStats.daysStats]; // find highest streak habit
  
  // Find the week with highest consistency
  let bestWeekNum = 1;
  let bestWeekPct = 0;
  [1, 2, 3, 4, 5].forEach(w => {
    const wPct = dailyStats.weekStats[w]?.percentage || 0;
    if (wPct > bestWeekPct) {
      bestWeekPct = wPct;
      bestWeekNum = w;
    }
  });

  const parts = [];

  parts.push(`This month of ${monthName} ${year}, I maintained a ${overallPct}% overall daily habit consistency.`);
  
  if (topHabits.over100Count > 0) {
    parts.push(`I exceeded 100% of my target goals on ${topHabits.over100Count} habit${topHabits.over100Count > 1 ? 's' : ''}, led by "${bestHabit.name}" at ${bestHabit.percentageFormatted}.`);
  } else {
    parts.push(`My standout habit was "${bestHabit.name}" reaching ${bestHabit.percentageFormatted} completion.`);
  }

  parts.push(`Week ${bestWeekNum} was my strongest period with ${bestWeekPct.toFixed(1)}% daily completion.`);

  if (weeklyStats.total > 0) {
    parts.push(`For weekly priorities, I completed ${weeklyStats.completed} out of ${weeklyStats.total} actions (${weeklyStats.percentageFormatted}).`);
  }

  if (monthlyStats.total > 0) {
    parts.push(`On major monthly milestones, I achieved ${monthlyStats.percentageFormatted} (${monthlyStats.completed}/${monthlyStats.total}).`);
  }

  parts.push(`I stayed mindful and showed up consistently. Next month, I will build upon this foundation — gently, intentionally, and with renewed curiosity.`);

  return parts.join('\n');
}
