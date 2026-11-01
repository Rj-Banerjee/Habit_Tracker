import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { supabase } from '../services/supabase';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radius, space, textStyles } from '../theme/tokens';

export function SignInScreen() {
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
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { data: { timezone } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  };

  const inputStyle = [
    styles.input,
    textStyles.body,
    { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.canvas }]}
    >
      <View style={styles.form}>
        <Text variant="title" accessibilityRole="header">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel="Email"
          style={inputStyle}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          accessibilityLabel="Password"
          style={inputStyle}
        />
        {message ? (
          <Text variant="small" muted accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
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
  form: { gap: space.md, width: '100%', maxWidth: 420, alignSelf: 'center' },
  input: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
