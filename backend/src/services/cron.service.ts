import cron from 'node-cron';
import { quoteService } from './quote.service';

export class CronService {
  private static isInitialized = false;

  public static init() {
    if (this.isInitialized) return;

    console.log('⏰ [Cron Service]: Initializing automated tasks scheduler...');

    // Schedule daily quote and image cache refresh at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
      console.log('🌅 [Cron Service]: Running daily motivational content refresh...');
      try {
        const result = await quoteService.refreshDailyQuote();
        console.log(`✅ [Cron Service]: Cached daily quote for ${result.date} - "${result.author}"`);
      } catch (error) {
        console.error('❌ [Cron Service]: Failed to refresh daily content:', error);
      }
    });

    this.isInitialized = true;
    console.log('✅ [Cron Service]: Scheduled midnight automated quote & image cache task.');
  }
}
