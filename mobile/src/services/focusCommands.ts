// Resume in the focus notification opens the app with a link, because only an app on
// screen can pin the phone. If Tunnel Vision is showing, the command goes straight to it;
// if the tap opened the app, it waits until the screen is there.
export type FocusCommand = 'resume';

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

// The command in a link like habittracker://focus?action=resume, if any.
export function focusCommandIn(url: string | null | undefined): FocusCommand | null {
  return /[?&]action=resume\b/.test(url ?? '') ? 'resume' : null;
}
