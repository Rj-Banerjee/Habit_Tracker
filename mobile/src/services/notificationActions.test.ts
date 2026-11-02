import * as Notifications from 'expo-notifications';
import { handleNotificationResponse } from './notificationActions';
import { offlineTracker as tracker } from './logQueue';
import { refreshWidget } from './widget';

jest.mock('expo-notifications', () => ({ dismissNotificationAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('./widget', () => ({ refreshWidget: jest.fn(() => Promise.resolve()) }));
jest.mock('./logQueue', () => ({
  offlineTracker: {
    getToday: jest.fn(() => Promise.resolve([])),
    logHabit: jest.fn(() => Promise.resolve()),
  },
}));

const response = (actionIdentifier: string, habitId?: string) => ({
  actionIdentifier,
  notification: { request: { identifier: 'n1', content: { data: { habitId } } } },
});

// What Android hands a background task: the library only unpacks this for listeners.
const rawResponse = (actionIdentifier: string, habitId: string) => ({
  actionIdentifier,
  notification: {
    request: { identifier: 'n1', content: { dataString: JSON.stringify({ habitId }) } },
  },
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

  it('logs from the raw form a background task gets', async () => {
    await handleNotificationResponse(rawResponse('smaller', 'h2'));
    expect(tracker.logHabit).toHaveBeenCalledWith('h2', null, 'minimum', null, 'notification');
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('n1');
  });

  it('logs once when the task and the listener both get the tap', async () => {
    await Promise.all([
      handleNotificationResponse(rawResponse('done', 'h3')),
      handleNotificationResponse(response('done', 'h3')),
    ]);
    expect(tracker.logHabit).toHaveBeenCalledTimes(1);
  });

  it('logs the same reminder again on a later day', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await handleNotificationResponse(response('done', 'h4'));
    now.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000);
    await handleNotificationResponse(response('done', 'h4'));
    now.mockRestore();
    expect(tracker.logHabit).toHaveBeenCalledTimes(2);
  });

  it('says so when a button arrives with no habit', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await handleNotificationResponse(response('done'));
    expect(tracker.logHabit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[notification action]', 'done tapped with no habit');
    warn.mockRestore();
  });
});
