import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { WIDGET_NAME } from '@habit-tracker/core';

const hasWidgets = () => Platform.OS === 'android' && !isRunningInExpoGo();

// The widget's native module isn't in Expo Go, and importing it there throws. So both of
// these load it only where it exists.
export function registerWidget() {
  if (!hasWidgets()) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../widget/register');
}

// After a log in the app, so the home screen matches. Never disturbs the app.
export async function refreshWidget() {
  if (!hasWidgets()) return;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { widgetView } = require('../widget/TodayWidget');
    const { loadWidget } = require('../widget/widgetData');
    /* eslint-enable @typescript-eslint/no-require-imports */
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: async () => widgetView(await loadWidget()),
    });
  } catch (error) {
    console.warn('[widget]', error instanceof Error ? error.message : error);
  }
}
