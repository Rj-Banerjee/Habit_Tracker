import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { layout, space } from '@habit-tracker/core';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import { Text } from './Text';
import { TextField } from './TextField';
import { useTheme } from './ThemeProvider';

const AUTH_MESSAGES: Record<string, string> = {
  over_email_send_rate_limit:
    "Too many emails were sent to set up accounts. Please wait an hour and try again, or use the link in the email you already have.",
  email_not_confirmed: 'Please confirm your email first, using the link we sent you.',
  invalid_credentials: "That email and password don't match.",
};

function authErrorMessage(error: { code?: string; message: string }): string {
  return (error.code && AUTH_MESSAGES[error.code]) || error.message;
}

export function AuthForm({ auth }: { auth: SupabaseClient['auth'] }) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (isSignUp && password.length < 8) {
      setMessage('Use at least 8 characters for your password.');
      return;
    }

    setBusy(true);
    setMessage(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data, error } = isSignUp
      ? await auth.signUp({ email, password, options: { data: { timezone } } })
      : await auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      setMessage(authErrorMessage(error));
    } else if (isSignUp && !data.session) {
      // Email confirmation is on, so there is nothing to sign in to yet.
      setIsSignUp(false);
      setMessage(`Check ${email} for a confirmation link, then sign in here.`);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.canvas }]}
    >
      <View style={styles.form}>
        <Text variant="title" accessibilityRole="header">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <FormMessage message={message} />
        <Button
          label={isSignUp ? 'Create account' : 'Sign in'}
          onPress={submit}
          disabled={busy || !email || !password}
        />
        <Button
          quiet
          label={isSignUp ? 'I already have an account' : 'Create an account'}
          onPress={() => {
            setIsSignUp(!isSignUp);
            setMessage(null);
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: space.xl },
  form: { gap: space.md, width: '100%', maxWidth: layout.readingWidth, alignSelf: 'center' },
});
