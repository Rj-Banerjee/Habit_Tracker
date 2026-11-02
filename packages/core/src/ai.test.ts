import { describe, expect, it, vi } from 'vitest';
import { CoachError, createAiClient } from './ai';

const client = (send: typeof fetch) =>
  createAiClient({ baseUrl: 'http://ai.test', getToken: async () => 'tok', fetch: send });

const streamed = (...chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    })
  );

const read = async (stream: AsyncGenerator<string>) => {
  const seen: string[] = [];
  for await (const text of stream) seen.push(text);
  return seen;
};

const ask = [{ role: 'user' as const, text: 'hi' }];

describe('createAiClient', () => {
  it('sends the session token', async () => {
    const send = vi.fn(async () =>
      Response.json({ heard: 'I ran', corrected: 'I ran', confidence: 1, level: 'none', intents: [] })
    );
    await client(send as unknown as typeof fetch).parseVoice('I ran');
    expect(send).toHaveBeenCalledWith(
      'http://ai.test/voice/parse',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      })
    );
  });

  it('streams a reply, even when an event splits across chunks', async () => {
    const send = async () =>
      streamed('data: {"type":"delta","text":"Hel', 'lo"}\n\ndata: {"type":"delta","text":" you"}\n\n', 'data: {"type":"done"}\n\n');
    await expect(read(client(send).chat(ask))).resolves.toEqual(['Hello', ' you']);
  });

  it('raises a failure that arrives mid-reply', async () => {
    const send = async () =>
      streamed('data: {"type":"delta","text":"Hi"}\n\ndata: {"type":"error","code":"busy","message":"Coach is busy, try again in a minute.","retry_after":60}\n\n');
    const stream = client(send).chat(ask);
    await expect(stream.next()).resolves.toMatchObject({ value: 'Hi' });
    await expect(stream.next()).rejects.toMatchObject({ code: 'busy', retryAfter: 60 });
  });

  it('passes on the friendly message from a refusal', async () => {
    const send = async () =>
      Response.json(
        { code: 'busy', message: 'Coach is busy, try again in a minute.', retry_after: 30 },
        { status: 429 }
      );
    await expect(client(send).parseVoice('I ran')).rejects.toMatchObject({
      message: 'Coach is busy, try again in a minute.',
      retryAfter: 30,
    });
  });

  it('reads an unset service the same as one that is down', async () => {
    const unset = createAiClient({ getToken: async () => 'tok' });
    await expect(unset.parseVoice('I ran')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('stays calm when the service is unreachable', async () => {
    const send = async () => {
      throw new TypeError('Failed to fetch');
    };
    const error = await client(send).parseVoice('I ran').catch((e) => e);
    expect(error).toBeInstanceOf(CoachError);
    expect(error.message).toContain('Your habits still work');
  });
});
