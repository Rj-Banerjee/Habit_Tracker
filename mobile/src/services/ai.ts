import { fetch as streamingFetch } from 'expo/fetch';
import { createAiClient } from '@habit-tracker/core';
import { supabase } from './supabase';

export const ai = createAiClient({
  baseUrl: process.env.EXPO_PUBLIC_AI_URL,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  fetch: streamingFetch as unknown as typeof fetch,
});
