import { registerWidgetTaskHandler, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { WIDGET_TOGGLE } from '@habit-tracker/core';
import { widgetView } from './TodayWidget';
import { loadWidget, toggleAndLoad } from './widgetData';

export async function handleWidget(props: WidgetTaskHandlerProps) {
  const { widgetAction, clickAction, clickActionData, renderWidget } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_CLICK' && clickAction !== WIDGET_TOGGLE) return;

  // Anything that fails in here is invisible, and an undrawn widget is just a transparent
  // gap on the home screen. So there's always something to draw.
  try {
    const state =
      widgetAction === 'WIDGET_CLICK'
        ? await toggleAndLoad(String(clickActionData?.habitId))
        : await loadWidget();
    renderWidget(widgetView(state));
  } catch (error) {
    console.warn('[widget]', error instanceof Error ? error.message : error);
    renderWidget(widgetView({ kind: 'failed' }));
  }
}

registerWidgetTaskHandler(handleWidget);
