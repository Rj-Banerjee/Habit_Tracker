import React, { useState } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Tab } from './TabBar';
import { TabPager, useHoldPager } from './TabPager';

// A one-finger touch from one x to another, as PanResponder reads it.
const touch = (fromX: number, toX: number, ms: number) => {
  const touchHistory = {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: ms,
    touchBank: [
      {
        touchActive: true,
        startPageX: fromX,
        startPageY: 400,
        startTimeStamp: 0,
        currentPageX: toX,
        currentPageY: 400,
        currentTimeStamp: ms,
        previousPageX: fromX,
        previousPageY: 400,
        previousTimeStamp: 0,
      },
    ],
  };
  return { touchHistory, nativeEvent: { touches: [{}], changedTouches: [{}], pageX: toX, pageY: 400 } };
};

// The order the responder system asks in: a touch starts, moves, and the pager is asked
// whether it wants the move. Says whether it did.
const moveBy = (dx: number, dy = 0) => {
  const frame = screen.getByTestId('tab-pager');
  const moved = touch(300, 300 + dx, 400);
  moved.touchHistory.touchBank[0].currentPageY = 400 + dy;
  frame.props.onStartShouldSetResponderCapture(touch(300, 300, 0));
  frame.props.onMoveShouldSetResponderCapture(moved);
  return { frame, moved, wanted: frame.props.onMoveShouldSetResponder(moved) as boolean };
};

const swipe = async (dx: number) => {
  await act(async () => {
    const { frame, moved, wanted } = moveBy(dx / 4);
    if (!wanted) return;
    // Granted where the finger had got to, then the rest of the swipe.
    frame.props.onResponderGrant(moved);
    const rest = touch(300 + dx / 4, 300 + dx, 800);
    rest.touchHistory.touchBank[0].previousTimeStamp = 400;
    frame.props.onResponderMove(rest);
    frame.props.onResponderRelease(rest);
  });
};

function Pages({ start = 'today', held = false }: { start?: Tab; held?: boolean }) {
  const [tab, setTab] = useState<Tab>(start);
  return (
    <>
      <Text testID="tab">{tab}</Text>
      <TabPager tab={tab} onChange={setTab}>
        <Holder held={held} />
        <Text>Progress page</Text>
        <Text>You page</Text>
      </TabPager>
    </>
  );
}

function Holder({ held }: { held: boolean }) {
  useHoldPager(held);
  return <Text>Today page</Text>;
}

const shown = () => screen.getByTestId('tab').props.children;

describe('TabPager', () => {
  it('swipes left to the next page and right to the one before', async () => {
    await render(<Pages />);
    await swipe(-400);
    expect(shown()).toBe('progress');
    await swipe(-400);
    expect(shown()).toBe('you');
    await swipe(400);
    expect(shown()).toBe('progress');
    await swipe(400);
    expect(shown()).toBe('today');
  });

  it('stays put past the first and last page, and for a short drag', async () => {
    await render(<Pages />);
    await swipe(400);
    expect(shown()).toBe('today');
    await swipe(-40);
    expect(shown()).toBe('today');
    await swipe(-400);
    await swipe(-400);
    await swipe(-400);
    expect(shown()).toBe('you');
  });

  it('only takes a mostly sideways move', async () => {
    await render(<Pages />);
    expect(moveBy(-40, 100).wanted).toBe(false);
    expect(moveBy(-10).wanted).toBe(false);
    expect(moveBy(-100).wanted).toBe(true);
  });

  it('holds still while a screen has something laid over it', async () => {
    await render(<Pages held />);
    expect(moveBy(-200).wanted).toBe(false);
  });

  it('keeps the pages off screen out of reach', async () => {
    await render(<Pages start="progress" />);
    expect(screen.getByTestId('page-progress').props.importantForAccessibility).toBe('auto');
    const today = screen.getByTestId('page-today', { includeHiddenElements: true });
    expect(today.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(today.props.pointerEvents).toBe('none');
    expect(screen.queryByText('Today page')).toBeNull();
    expect(screen.getByText('Progress page')).toBeTruthy();
  });
});

