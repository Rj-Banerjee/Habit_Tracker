import { registerRootComponent } from 'expo';

import App from './App';
import { registerNotificationActions } from './src/services/notificationActions';
import { registerWidget } from './src/services/widget';

registerWidget();
registerNotificationActions();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
