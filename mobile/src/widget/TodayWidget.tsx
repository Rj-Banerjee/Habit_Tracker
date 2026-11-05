import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import {
  colors,
  identityColors,
  ThemeName,
  VOICE_LINK,
  WIDGET_TOGGLE,
  WidgetItem,
  WidgetModel,
} from '@habit-tracker/core';

type Hex = `#${string}`;

const MARK = 18;
const ROW = 44;

export type WidgetState =
  | { kind: 'ready'; model: WidgetModel; note?: string }
  | { kind: 'signedOut' }
  | { kind: 'failed' };

function Row({ item, theme }: { item: WidgetItem; theme: ThemeName }) {
  const palette = colors[theme];
  const accent = identityColors[theme][item.identity].accent as Hex;
  return (
    <FlexWidget
      clickAction={WIDGET_TOGGLE}
      clickActionData={{ habitId: item.habitId }}
      style={{
        height: ROW,
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <FlexWidget
        style={{
          height: MARK,
          width: MARK,
          borderRadius: MARK / 2,
          borderWidth: 2,
          borderColor: accent,
          backgroundColor: item.done ? accent : (palette.surface as Hex),
        }}
      />
      <TextWidget
        text={item.title}
        maxLines={1}
        truncate="END"
        style={{
          marginLeft: 12,
          fontSize: 15,
          color: (item.done ? palette.textMuted : palette.text) as Hex,
        }}
      />
    </FlexWidget>
  );
}

function View({ state, theme }: { state: WidgetState; theme: ThemeName }) {
  const palette = colors[theme];
  const muted = palette.textMuted as Hex;
  const text = palette.text as Hex;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        padding: 16,
        borderRadius: 16,
        backgroundColor: palette.surface as Hex,
      }}
    >
      {state.kind === 'signedOut' ? (
        <TextWidget text="Sign in to see your habits" style={{ fontSize: 15, color: text }} />
      ) : state.kind === 'failed' ? (
        <TextWidget text="Open the app to see your habits" style={{ fontSize: 15, color: text }} />
      ) : (
        // A Fragment would stop the library from building the widget, leaving it blank.
        <FlexWidget style={{ width: 'match_parent' }}>
          <TextWidget
            text={state.model.summary}
            maxLines={1}
            style={{ fontSize: 16, fontWeight: '600', color: text, marginBottom: 4 }}
          />
          {state.note ? (
            <TextWidget text={state.note} style={{ fontSize: 12, color: muted }} />
          ) : null}
          {state.model.items.length === 0 ? (
            <TextWidget text="Nothing is due today." style={{ fontSize: 14, color: muted }} />
          ) : null}
          {state.model.items.map((item) => (
            <Row key={item.habitId} item={item} theme={theme} />
          ))}
          {state.model.more > 0 ? (
            <TextWidget text={`${state.model.more} more`} style={{ fontSize: 12, color: muted }} />
          ) : null}
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: VOICE_LINK }}
            style={{ height: ROW, width: 'match_parent', justifyContent: 'center' }}
          >
            <TextWidget text="Log by voice" style={{ fontSize: 14, color: text }} />
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

export function widgetView(state: WidgetState) {
  return {
    light: <View state={state} theme="light" />,
    dark: <View state={state} theme="dark" />,
  };
}
