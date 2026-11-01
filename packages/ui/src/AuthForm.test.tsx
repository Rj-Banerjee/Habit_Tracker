import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthForm } from './AuthForm';
import { ThemeProvider } from './ThemeProvider';

const auth = { signUp: jest.fn(), signInWithPassword: jest.fn() };

const open = () =>
  render(
    <ThemeProvider forced="light">
      <AuthForm auth={auth as unknown as SupabaseClient['auth']} />
    </ThemeProvider>
  );

const fill = async (password = 'correct-horse-battery') => {
  await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
};

describe('AuthForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('says to check email when sign-up needs confirmation', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/Check me@example.test for a confirmation link/)).toBeTruthy();
  });

  it('moves to sign in after that, so the button cannot resend emails', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  });

  it('sends the device timezone at sign-up', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.signUp.mock.calls[0][0].options.data.timezone).toEqual(expect.any(String));
  });

  it.each([
    ['over_email_send_rate_limit', /Please wait an hour/],
    ['email_not_confirmed', /Please confirm your email first/],
    ['invalid_credentials', /don't match/],
  ])('explains %s in plain words', async (code, text) => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code, message: 'raw message' },
    });
    await open();
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('shows the original message for anything else', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Something unusual' },
    });
    await open();
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Something unusual')).toBeTruthy();
  });

  it('refuses a short password before calling the server', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fill('short');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 8 characters/)).toBeTruthy();
  });
});
