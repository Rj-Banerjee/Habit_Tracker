import { widgetView, WidgetState } from './TodayWidget';

// The real widgets and the real tree builder, because this is where a layout the library
// can't read fails. A stand-in hid that, and the widget came up blank on a real phone.
jest.mock('react-native-android-widget', () => {
  const root = 'react-native-android-widget/lib/commonjs/widgets';
  return {
    FlexWidget: jest.requireActual(`${root}/FlexWidget`).FlexWidget,
    TextWidget: jest.requireActual(`${root}/TextWidget`).TextWidget,
  };
});

const { buildWidgetTree } = jest.requireActual(
  'react-native-android-widget/lib/commonjs/api/build-widget-tree'
);

const texts = (node: { type: string; props: { text?: string }; children?: never[] }): string[] => [
  ...(node.props.text ? [node.props.text] : []),
  ...(node.children ?? []).flatMap(texts),
];

const item = (id: string, done = false) => ({
  habitId: id,
  title: id,
  done,
  identity: 'identity-1' as const,
});

const states: [string, WidgetState][] = [
  ['habits', { kind: 'ready', model: { summary: '1 of 2 done', items: [item('Read'), item('Run', true)], more: 0 } }],
  ['nothing due', { kind: 'ready', model: { summary: 'Today', items: [], more: 0 } }],
  ['a note and more', { kind: 'ready', note: 'Later', model: { summary: 'S', items: [item('A')], more: 2 } }],
  ['signed out', { kind: 'signedOut' }],
  ['a failure', { kind: 'failed' }],
];

describe('TodayWidget', () => {
  it.each(states)('builds a real layout for %s, light and dark', (_, state) => {
    const { light, dark } = widgetView(state);
    expect(texts(buildWidgetTree(light)).length).toBeGreaterThan(0);
    expect(texts(buildWidgetTree(dark)).length).toBeGreaterThan(0);
  });

  it('shows the habits and the voice button', () => {
    const shown = texts(buildWidgetTree(widgetView(states[0][1]).light));
    expect(shown).toEqual(['1 of 2 done', 'Read', 'Run', 'Log by voice']);
  });
});
