import { localDate, OFFLINE_MESSAGE, TodayRow } from '@habit-tracker/core';
import { supabase } from '../services/supabase';
import { tracker } from '../services/tracker';
import { handleWidget } from './register';
import { WidgetState } from './TodayWidget';
import { loadWidget, toggleAndLoad } from './widgetData';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStore.get(key) ?? null,
  setItem: async (key: string, value: string) => void mockStore.set(key, value),
}));
jest.mock('react-native-android-widget', () => ({
  registerWidgetTaskHandler: jest.fn(),
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
}));
jest.mock('../services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('../services/tracker', () => ({
  tracker: { getToday: jest.fn(), logHabit: jest.fn(), undoLog: jest.fn(), skipHabit: jest.fn() },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const session = supabase.auth.getSession as jest.Mock;

const row = {
  habit_id: 'h1',
  title: 'Read',
  status: 'pending',
  level_done: null,
  is_today: true,
  day: '2026-11-02',
  colour_token: 'identity-1',
  target: null,
  levels: [],
} as unknown as TodayRow;

const ready = (state: WidgetState) => {
  if (state.kind !== 'ready') throw new Error('expected ready');
  return state;
};

describe('the widget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    session.mockResolvedValue({ data: { session: { access_token: 't' } } });
    api.getToday.mockReset();
    api.logHabit.mockReset();
    api.getToday.mockResolvedValue([{ ...row, day: localDate(zone) }]);
    api.logHabit.mockResolvedValue(null as never);
  });

  it('asks a signed-out person to open the app', async () => {
    session.mockResolvedValue({ data: { session: null } });
    expect((await loadWidget()).kind).toBe('signedOut');
  });

  it("shows today's habits", async () => {
    expect(ready(await loadWidget()).model.items[0].title).toBe('Read');
  });

  it('shows the last list when offline, and says so', async () => {
    await loadWidget();
    api.getToday.mockRejectedValue(new Error(OFFLINE_MESSAGE));
    const state = ready(await loadWidget());
    expect(state.model.items[0].title).toBe('Read');
    expect(state.note).toBe("Offline. It'll sync when you're back.");
  });

  it('keeps a tap made offline, and shows it as done', async () => {
    await loadWidget();
    api.getToday.mockRejectedValue(new Error(OFFLINE_MESSAGE));
    api.logHabit.mockRejectedValue(new Error(OFFLINE_MESSAGE));
    expect(ready(await toggleAndLoad('h1')).model.items[0].done).toBe(true);
  });

  it('logs on a tap, marked as coming from the widget', async () => {
    await toggleAndLoad('h1');
    expect(api.logHabit).toHaveBeenCalledWith('h1', localDate(zone), 'full', null, 'widget');
  });

  it('says when a tap did not save', async () => {
    api.logHabit.mockRejectedValue(new Error('offline'));
    expect(ready(await toggleAndLoad('h1')).note).toBe("That didn't save. Try again.");
  });

  const handled = async (props: object) => {
    const renderWidget = jest.fn();
    await handleWidget({ widgetInfo: {}, renderWidget, ...props } as never);
    return renderWidget;
  };

  it('draws when added, for light and dark', async () => {
    const render = await handled({ widgetAction: 'WIDGET_ADDED' });
    expect(Object.keys(render.mock.calls[0][0])).toEqual(['light', 'dark']);
  });

  it('redraws after a tap', async () => {
    const render = await handled({
      widgetAction: 'WIDGET_CLICK',
      clickAction: 'TOGGLE',
      clickActionData: { habitId: 'h1' },
    });
    expect(api.logHabit).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it('always draws something, even when everything fails', async () => {
    session.mockRejectedValue(new Error('storage is broken'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const render = await handled({ widgetAction: 'WIDGET_UPDATE' });
    expect(render).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('shows the tap before the server answers, then confirms', async () => {
    await loadWidget();
    const render = await handled({
      widgetAction: 'WIDGET_CLICK',
      clickAction: 'TOGGLE',
      clickActionData: { habitId: 'h1' },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('ignores a removed widget', async () => {
    const render = await handled({ widgetAction: 'WIDGET_DELETED' });
    expect(render).not.toHaveBeenCalled();
  });
});
