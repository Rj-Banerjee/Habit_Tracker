import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SECRET_KEY: 'placeholder-secret-key',
      DATABASE_URL: 'postgresql://user:password@127.0.0.1:1/test',
      DIRECT_URL: 'postgresql://user:password@127.0.0.1:1/test',
    },
  },
});
