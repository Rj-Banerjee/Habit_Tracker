import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { IdentityToken } from '@habit-tracker/core';
import { Chip } from './Chip';
import { ColourPicker } from './ColourPicker';
import { SegmentedControl } from './SegmentedControl';
import { TextField } from './TextField';
import { ThemeProvider } from './ThemeProvider';
import { WeekdayPicker } from './WeekdayPicker';

const inTheme = (element: React.ReactElement) =>
  render(<ThemeProvider forced="light">{element}</ThemeProvider>);

describe('form components', () => {
  it('shows an error in place of a hint', async () => {
    await inTheme(<TextField label="Name" hint="A short name" error="Give the habit a name" />);
    expect(screen.getByText('Give the habit a name')).toBeTruthy();
    expect(screen.queryByText('A short name')).toBeNull();
  });

  it('labels text fields for screen readers', async () => {
    const onChangeText = jest.fn();
    await inTheme(<TextField label="Name" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Read');
    expect(onChangeText).toHaveBeenCalledWith('Read');
  });

  it('announces whether a chip is selected', async () => {
    await inTheme(<Chip label="Count" selected onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Count', selected: true })).toBeTruthy();
  });

  it('reads out full weekday names and toggles them', async () => {
    const onChange = jest.fn();
    await inTheme(<WeekdayPicker days={[1]} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Thu' }));
    expect(onChange).toHaveBeenCalledWith([1, 4]);
  });

  it('reports the segment chosen', async () => {
    const onChange = jest.fn();
    await inTheme(
      <SegmentedControl
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'One' },
          { value: 'b', label: 'Two' },
        ]}
      />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Two' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('names every identity colour', async () => {
    const onChange = jest.fn();
    await inTheme(<ColourPicker value={'identity-1' as IdentityToken} onChange={onChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    await fireEvent.press(screen.getByRole('button', { name: 'Plum' }));
    expect(onChange).toHaveBeenCalledWith('identity-5');
  });
});
