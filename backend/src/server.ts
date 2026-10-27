import app from './app';
import { CronService } from './services/cron.service';
import { prisma } from './models/prisma';

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 [Habit Tracker Backend]: Server listening on http://localhost:${PORT}`);
  console.log(`📊 [API Docs & Health]: http://localhost:${PORT}/api/health`);

  // Initialize automated background cron tasks
  CronService.init();
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`\n🛑 [Server]: Received ${signal}. Closing server gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('✅ [Database]: Disconnected from PostgreSQL.');
      process.exit(0);
    } catch (err) {
      console.error('❌ [Database]: Error during disconnect:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
