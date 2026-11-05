import { focusCommandIn, onFocusCommand, sendFocusCommand } from './focusCommands';

describe('Resume from the focus notification', () => {
  it('reads Resume out of the app link, and nothing else', () => {
    expect(focusCommandIn('habittracker://focus?action=resume')).toBe('resume');
    expect(focusCommandIn('habittracker://focus')).toBeNull();
    expect(focusCommandIn('habittracker://focus?action=delete')).toBeNull();
    expect(focusCommandIn(null)).toBeNull();
  });

  it('goes straight to Tunnel Vision when it is on screen', () => {
    const handle = jest.fn();
    const stop = onFocusCommand(handle);
    sendFocusCommand('resume');
    expect(handle).toHaveBeenCalledWith('resume');
    stop();
  });

  it('waits for Tunnel Vision when the tap opened the app, and is acted on once', () => {
    sendFocusCommand('resume');
    const handle = jest.fn();
    const stop = onFocusCommand(handle);
    expect(handle).toHaveBeenCalledWith('resume');
    stop();
    const again = jest.fn();
    onFocusCommand(again)();
    expect(again).not.toHaveBeenCalled();
  });
});
