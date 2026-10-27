import { ApiClient } from './api';
import { DailyQuoteData } from '../types';

export const contentService = {
  async getDailyQuote(): Promise<DailyQuoteData> {
    return ApiClient.get<DailyQuoteData>('/content/quote');
  },

  async refreshDailyQuote(): Promise<DailyQuoteData> {
    return ApiClient.post<DailyQuoteData>('/content/quote/refresh');
  },
};
