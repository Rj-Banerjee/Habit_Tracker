import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create Demo User
  const demoEmail = 'demo@habittracker.com';
  const user = await prisma.users.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: demoEmail,
    },
  });

  console.log(`👤 User ready: ${user.email} (${user.id})`);

  // 2. Clear existing demo data for clean state
  await prisma.dailyLogs.deleteMany({
    where: { habit: { user_id: user.id } },
  });
  await prisma.dailyHabits.deleteMany({
    where: { user_id: user.id },
  });
  await prisma.weeklyHabits.deleteMany({
    where: { user_id: user.id },
  });
  await prisma.monthlyHabits.deleteMany({
    where: { user_id: user.id },
  });
  await prisma.monthlyReflections.deleteMany({
    where: { user_id: user.id },
  });

  // 3. Seed Daily Habits
  const dailyHabitsDef = [
    { title: 'Review class notes', goalDays: 30 },
    { title: 'Complete assignments', goalDays: 30 },
    { title: 'Organize study desk', goalDays: 30 },
    { title: 'Read 10 pages of a book', goalDays: 30 },
    { title: 'Exercise for 30 minutes', goalDays: 31 },
    { title: 'Drink 8 glasses of water', goalDays: 30 },
    { title: 'Plan next day\'s schedule', goalDays: 31 },
    { title: 'Meditate for 10 minutes', goalDays: 31 },
    { title: 'Check emails and updates', goalDays: 31 },
    { title: 'Practice language skills', goalDays: 31 },
    { title: 'Review flashcards', goalDays: 31 },
    { title: 'Write in a journal', goalDays: 31 },
    { title: 'Solve 3 practice problems', goalDays: 31 },
    { title: 'Connect with a classmate', goalDays: 31 },
    { title: 'Watch an educational video', goalDays: 31 },
    { title: 'Take a 15-minute walk', goalDays: 20 },
    { title: 'Get at least 7 hours of sleep', goalDays: 22 },
    { title: 'Healthy nutritious breakfast', goalDays: 30 },
    { title: 'Evening wind-down & stretch', goalDays: 30 },
  ];

  const pad = (n: number) => String(n).padStart(2, '0');

  const daysPatterns: Record<number, number[]> = {
    0: [1, 4, 8, 11, 14, 15, 17, 18, 22, 28, 29, 7, 2, 9, 21], // 15 days
    1: [1, 2, 3, 4, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 22, 23, 25, 27, 29, 30, 6, 20], // 22 days
    2: [1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24, 25, 28, 29, 30, 7], // 23 days
    3: [1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29, 30, 20], // 25 days
    4: [1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30], // 26 days
    5: [2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 26 days
    6: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29], // 27 days
    7: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 29 days
    8: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 30 days
    9: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29], // 28 days
    10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30], // 29 days
    11: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30], // 29 days
    12: [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30], // 25 days
    13: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29], // 25 days
    14: [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 21, 23, 25, 26, 28, 29], // 21 days
    15: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 30 days (150%)
    16: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29], // 29 days (131%)
    17: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 15, 16, 18, 19, 22, 23], // 17 days
    18: [1, 2, 3, 5, 8, 9, 15, 16, 22, 23], // 10 days
  };

  for (let i = 0; i < dailyHabitsDef.length; i++) {
    const def = dailyHabitsDef[i];
    const habit = await prisma.dailyHabits.create({
      data: {
        user_id: user.id,
        title: def.title,
        goal_days: def.goalDays,
      },
    });

    const activeDays = daysPatterns[i] || [];
    for (const d of activeDays) {
      const dateStr = `2026-06-${pad(d)}`;
      await prisma.dailyLogs.create({
        data: {
          habit_id: habit.id,
          date: dateStr,
          is_completed: true,
        },
      });
    }
  }

  console.log(`✅ Seeded ${dailyHabitsDef.length} Daily Habits and 466 Daily Logs.`);

  // 4. Seed Weekly Habits
  const weeklyHabitsDef = [
    { week: 1, title: 'Back up important files', completed: true },
    { week: 1, title: 'Deep clean study area', completed: true },
    { week: 1, title: 'Submit weekly assignments', completed: true },
    { week: 1, title: 'Review last week\'s lectures', completed: false },

    { week: 2, title: 'Plan weekly finances', completed: false },
    { week: 2, title: 'Do a weekly workout review', completed: true },
    { week: 2, title: 'Meal prep for the week', completed: true },
    { week: 2, title: 'Check in with a loved one', completed: false },
    { week: 2, title: 'Take a walk outdoors', completed: false },

    { week: 3, title: 'Organize weekly planner', completed: true },
    { week: 3, title: 'Complete one hobby project', completed: true },
    { week: 3, title: 'Call or meet family/friends', completed: true },

    { week: 4, title: 'Plan weekly finances', completed: true },
    { week: 4, title: 'Meal prep for the week', completed: false },
    { week: 4, title: 'Do a weekly workout review', completed: true },
    { week: 4, title: 'Check in with a loved one', completed: true },
    { week: 4, title: 'Take a walk outdoors', completed: true },

    { week: 5, title: 'Plan weekly finances', completed: false },
    { week: 5, title: 'Have a screen free evening', completed: true },
    { week: 5, title: 'Meal prep for the week', completed: true },
    { week: 5, title: 'Do a weekly workout review', completed: true },
  ];

  for (const item of weeklyHabitsDef) {
    await prisma.weeklyHabits.create({
      data: {
        user_id: user.id,
        title: item.title,
        week_number: item.week,
        month: 6,
        year: 2026,
        is_completed: item.completed,
      },
    });
  }

  console.log(`✅ Seeded ${weeklyHabitsDef.length} Weekly Habits across Weeks 1-5.`);

  // 5. Seed Monthly Habits
  const monthlyHabitsDef = [
    { title: 'Reflect on academic progress', completed: false },
    { title: 'Update long-term goals', completed: true },
    { title: 'Meet with academic advisor', completed: true },
    { title: 'Pay bills and check finances', completed: false },
  ];

  for (const item of monthlyHabitsDef) {
    await prisma.monthlyHabits.create({
      data: {
        user_id: user.id,
        title: item.title,
        month: 6,
        year: 2026,
        is_completed: item.completed,
      },
    });
  }

  console.log(`✅ Seeded ${monthlyHabitsDef.length} Monthly Habits.`);

  // 6. Seed Monthly Reflection
  await prisma.monthlyReflections.create({
    data: {
      user_id: user.id,
      month: 6,
      year: 2026,
      content: `This month, I felt more present in my creative practice.
Guiding my students through mindful drawing sessions
reminded me to slow down and notice the small details.
I stayed consistent with my morning sketching,
though I want to bring more playfulness
into my personal work next month.
I'm proud of how I showed up
— gently, intentionally, and with curiosity.`,
    },
  });

  console.log('✅ Seeded Monthly Reflection.');
  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
