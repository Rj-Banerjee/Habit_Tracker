import { ApiClient } from './api';
import { MonthAnalytics, DailyQuoteData } from '../types';

export const analyticsService = {
  async getMonthAnalytics(year: number, month: number): Promise<MonthAnalytics> {
    return ApiClient.get<MonthAnalytics>(`/analytics/month?year=${year}&month=${month}`);
  },
};

export const contentService = {
  async getDailyQuote(): Promise<DailyQuoteData> {
    return ApiClient.get<DailyQuoteData>('/content/quote');
  },

  async refreshDailyQuote(): Promise<DailyQuoteData> {
    return ApiClient.post<DailyQuoteData>('/content/quote/refresh');
  },
};
