import cron from 'node-cron';
import { quoteService } from './quote.service';
import { aiCoachService } from './aiCoachService';

export class CronService {
  private static isInitialized = false;

  public static init() {
    if (this.isInitialized) return;

    console.log('⏰ [Cron Service]: Initializing automated tasks scheduler...');

    // 1. Schedule daily quote and image cache refresh at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
      console.log('🌅 [Cron Service]: Running daily motivational content refresh...');
      try {
        const result = await quoteService.refreshDailyQuote();
        console.log(`✅ [Cron Service]: Cached daily quote for ${result.date} - "${result.author}"`);
      } catch (error) {
        console.error('❌ [Cron Service]: Failed to refresh daily content:', error);
      }
    });

    // 2. Proactive AI Coach Check-in at 12:00 PM (12:00) and 9:00 PM (21:00)
    // If zero habits are logged, dispatches a supportive Atomic Habits message
    cron.schedule('0 12,21 * * *', async () => {
      console.log('🤖 [Cron Service]: Checking user habit activity for proactive AI Coach check-in...');
      try {
        const result = await aiCoachService.checkAndDispatchProactiveMessages();
        console.log(`✅ [Cron Service]: Proactive AI Coach dispatched ${result.dispatchedCount} message(s) for ${result.timeSlot} (${result.date}).`);
      } catch (error) {
        console.error('❌ [Cron Service]: Proactive AI Coach check failed:', error);
      }
    });

    this.isInitialized = true;
    console.log('✅ [Cron Service]: Scheduled midnight quote refresh and 12:00 PM / 9:00 PM proactive AI Coach workers.');
  }
}
