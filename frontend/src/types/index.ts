export interface User {
  id: string;
  email: string;
}

export interface DayCalendarInfo {
  day: number;
  letter: string;
  dateKey: string;
  weekIndex: number;
}

export interface MonthCalendar {
  year: number;
  month: number;
  monthName: string;
  daysInMonth: number;
  days: DayCalendarInfo[];
  weeks: Record<number, DayCalendarInfo[]>;
}
