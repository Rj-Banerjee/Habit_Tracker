import { registerWidgetTaskHandler, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { WIDGET_TOGGLE } from '@habit-tracker/core';
import { widgetView } from './TodayWidget';
import { loadWidget, toggleAndLoad } from './widgetData';

export async function handleWidget(props: WidgetTaskHandlerProps) {
  const { widgetAction, clickAction, clickActionData, renderWidget } = props;
  if (widgetAction === 'WIDGET_DELETED') return;

  if (widgetAction === 'WIDGET_CLICK') {
    if (clickAction !== WIDGET_TOGGLE) return;
    renderWidget(widgetView(await toggleAndLoad(String(clickActionData?.habitId))));
    return;
  }
  renderWidget(widgetView(await loadWidget()));
}

registerWidgetTaskHandler(handleWidget);
