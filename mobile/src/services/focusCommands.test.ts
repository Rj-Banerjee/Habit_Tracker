import { focusCommandIn, onFocusCommand, sendFocusCommand } from './focusCommands';

describe('focus commands from the notification', () => {
  it('reads Stop and Done out of the app link, and nothing else', () => {
    expect(focusCommandIn('habittracker://focus?action=done')).toBe('done');
    expect(focusCommandIn('habittracker://focus?action=stop')).toBe('stop');
    expect(focusCommandIn('habittracker://focus')).toBeNull();
    expect(focusCommandIn('habittracker://focus?action=delete')).toBeNull();
    expect(focusCommandIn(null)).toBeNull();
  });

  it('goes straight to Tunnel Vision when it is on screen', () => {
    const handle = jest.fn();
    const stop = onFocusCommand(handle);
    sendFocusCommand('done');
    expect(handle).toHaveBeenCalledWith('done');
    stop();
  });

  it('waits for Tunnel Vision when the tap opened the app, and is acted on once', () => {
    sendFocusCommand('stop');
    const handle = jest.fn();
    const stop = onFocusCommand(handle);
    expect(handle).toHaveBeenCalledWith('stop');
    stop();
    const again = jest.fn();
    onFocusCommand(again)();
    expect(again).not.toHaveBeenCalled();
  });
});
