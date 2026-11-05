// Stop and Done from the focus notification arrive as an app link. If Tunnel Vision is on
// screen they go straight to it; if the app was opened by the tap, it waits for the screen.
export type FocusCommand = 'stop' | 'done';

let listener: ((command: FocusCommand) => void) | null = null;
let waiting: FocusCommand | null = null;

export function sendFocusCommand(command: FocusCommand) {
  if (listener) listener(command);
  else waiting = command;
}

export function onFocusCommand(handle: (command: FocusCommand) => void) {
  listener = handle;
  if (waiting) {
    const command = waiting;
    waiting = null;
    handle(command);
  }
  return () => {
    if (listener === handle) listener = null;
  };
}

// The command in a link like habittracker://focus?action=done, if any.
export function focusCommandIn(url: string | null | undefined): FocusCommand | null {
  const action = url?.match(/[?&]action=(stop|done)\b/)?.[1];
  return action === 'stop' || action === 'done' ? action : null;
}
