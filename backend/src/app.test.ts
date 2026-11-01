import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import express from 'express';
import app from './app';
import { errorHandler } from './middlewares/error.middleware';
import { validateRequest } from './middlewares/validation.middleware';

describe('api app', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects habit requests without a token', async () => {
    const res = await request(app).get('/api/habits/daily');
    expect(res.status).toBe(401);
  });

  it('rejects coach requests without a token', async () => {
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects the old development token', async () => {
    const res = await request(app)
      .get('/api/habits/daily')
      .set('Authorization', 'Bearer dev-mock-token');
    expect(res.status).toBe(401);
  });

  it('requires a token to refresh the shared quote', async () => {
    const res = await request(app).post('/api/content/quote/refresh');
    expect(res.status).toBe(401);
  });

  it('has removed the route that wrote messages for every user', async () => {
    const res = await request(app)
      .post('/api/ai/proactive-check')
      .set('Authorization', 'Bearer anything');
    expect([401, 404]).toContain(res.status);
  });

  it('allows the configured web origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('gives other origins no CORS access', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not expose stack traces', async () => {
    const res = await request(app).get('/api/habits/daily');
    expect(res.body.stack).toBeUndefined();
  });

  it('rejects oversized request bodies', async () => {
    const res = await request(app)
      .post('/api/content/quote/refresh')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('rejects malformed JSON as a client error', async () => {
    const res = await request(app)
      .post('/api/content/quote/refresh')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});

describe('validateRequest', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.post(
    '/items/:id',
    validateRequest({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ title: z.string().min(1) }),
    }),
    (req, res) => {
      res.json({ title: req.body.title });
    }
  );
  testApp.use(errorHandler);

  const id = '3f2b8e0a-6c1d-4a7e-9b52-1d0c7e4f8a21';

  it('passes valid input through', async () => {
    const res = await request(testApp).post(`/items/${id}`).send({ title: 'Read' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Read');
  });

  it('returns 400 with the failing field for invalid input', async () => {
    const res = await request(testApp).post(`/items/${id}`).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('title');
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(testApp).post('/items/not-a-uuid').send({ title: 'Read' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('id');
  });
});
