import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('client source', () => {
  const files = sourceFiles('src').filter((file) => !file.endsWith('secrets.test.ts'));

  it('never references server-only secrets', () => {
    const forbidden = /SUPABASE_SECRET_KEY|SERVICE_ROLE|DATABASE_URL|ANTHROPIC_API_KEY|sb_secret_/;
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('has no development auth bypass or demo user', () => {
    const forbidden = /dev-mock-token|demo@habittracker|00000000-0000-0000-0000-000000000001/;
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
