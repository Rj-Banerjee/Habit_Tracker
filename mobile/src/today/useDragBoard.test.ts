import { Animated } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useDragBoard } from './useDragBoard';

// Springs finish at once here, so each card is where it was sent.
const springs = jest.spyOn(Animated, 'spring').mockImplementation(
  (value, config) =>
    ({
      start: (done?: (result: { finished: boolean }) => void) => {
        (value as Animated.Value).setValue((config as { toValue: number }).toValue);
        done?.({ finished: true });
      },
      stop: () => {},
      reset: () => {},
    }) as unknown as Animated.CompositeAnimation
);

// Morning: its title and two cards. Evening: its title and one card. 60 tall, 8 apart.
const layout = (board: ReturnType<typeof useDragBoard>) => {
  board.placeSection('morning', 0);
  board.place('head:morning', { kind: 'header', time: 'morning', y: 0, height: 20 });
  board.place('card:a', { kind: 'card', time: 'morning', y: 28, height: 60 });
  board.place('card:b', { kind: 'card', time: 'morning', y: 96, height: 60 });
  board.placeSection('evening', 164);
  board.place('head:evening', { kind: 'header', time: 'evening', y: 0, height: 20 });
  board.place('card:c', { kind: 'card', time: 'evening', y: 28, height: 60 });
};
const ORDER = ['head:morning', 'card:a', 'card:b', 'head:evening', 'card:c'];
const at = (board: ReturnType<typeof useDragBoard>, key: string) =>
  (board.offsetOf(key) as unknown as { _value: number })._value;

describe('the drag board', () => {
  beforeEach(() => springs.mockClear());

  it('lets the others make room as a card is dragged up, and lands it in its place', async () => {
    const { result } = await renderHook(() => useDragBoard(8));
    layout(result.current);
    await act(async () => result.current.start('card:c'));
    expect(result.current.dragged).toBe('card:c');

    await act(async () => result.current.move('card:c', -164, ORDER));
    expect(at(result.current, 'card:c')).toBe(-164);
    expect(at(result.current, 'card:a')).toBe(68);
    expect(at(result.current, 'card:b')).toBe(68);
    expect(at(result.current, 'head:evening')).toBe(68);
    expect(at(result.current, 'head:morning')).toBe(0);

    const onLand = jest.fn();
    await act(async () => result.current.drop('card:c', -150, ORDER, onLand));
    // It settles from under the finger into where a was, then says where it landed.
    expect(at(result.current, 'card:c')).toBe(-164);
    expect(onLand).toHaveBeenCalledWith(expect.objectContaining({ time: 'morning', index: 0 }));

    await act(async () => result.current.settle());
    expect(at(result.current, 'card:a')).toBe(0);
    expect(at(result.current, 'card:c')).toBe(0);
    expect(result.current.dragged).toBeNull();
  });

  it('uses a bouncy spring for the room it makes', async () => {
    const { result } = await renderHook(() => useDragBoard(8));
    layout(result.current);
    await act(async () => result.current.move('card:c', -164, ORDER));
    expect(springs.mock.calls[0][1]).toMatchObject({ friction: 7, tension: 140 });
  });

  it('springs everything back when the drag is cancelled', async () => {
    const { result } = await renderHook(() => useDragBoard(8));
    layout(result.current);
    await act(async () => {
      result.current.start('card:a');
      result.current.move('card:a', 200, ORDER);
    });
    expect(at(result.current, 'card:b')).toBe(-68);
    await act(async () => result.current.cancel());
    expect(at(result.current, 'card:b')).toBe(0);
    expect(at(result.current, 'card:a')).toBe(0);
    expect(result.current.dragged).toBeNull();
  });
});
