import * as Notifications from 'expo-notifications';
import { handleNotificationResponse } from './notificationActions';
import { tracker } from './tracker';
import { refreshWidget } from './widget';

jest.mock('expo-notifications', () => ({ dismissNotificationAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('./widget', () => ({ refreshWidget: jest.fn(() => Promise.resolve()) }));
jest.mock('./tracker', () => ({
  tracker: {
    getToday: jest.fn(() => Promise.resolve([])),
    logHabit: jest.fn(() => Promise.resolve()),
  },
}));

const response = (actionIdentifier: string, habitId?: string) => ({
  actionIdentifier,
  notification: { request: { identifier: 'n1', content: { data: { habitId } } } },
});

describe('handleNotificationResponse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs, updates the widget, and clears the notification', async () => {
    await handleNotificationResponse(response('done', 'h1'));
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', null, 'full', null, 'notification');
    expect(refreshWidget).toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('n1');
  });

  it('leaves a plain tap on the notification alone', async () => {
    await handleNotificationResponse(response('default', 'h1'));
    expect(tracker.logHabit).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('ignores the daily reminder, which has no habit', async () => {
    await handleNotificationResponse(response('done'));
    expect(tracker.logHabit).not.toHaveBeenCalled();
  });
});
