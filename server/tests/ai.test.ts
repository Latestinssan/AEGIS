import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/index';

describe('AI endpoints', () => {
  const app = createApp();

  it('should return models list (fallback works)', async () => {
    const res = await request(app).get('/api/ai/models');
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe('boolean');
    expect(typeof res.body.baseUrl).toBe('string');
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('should suggest a command for a known intent', async () => {
    const intent = 'list the workspace';
    const res = await request(app).post('/api/ai/suggest').send({ intent });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe(intent);
    expect(typeof res.body.source).toBe('string');
    expect(typeof res.body.latencyMs).toBe('number');
    expect(res.body.proposal).toBeDefined();
    expect(res.body.evaluation).toBeDefined();
  });
});
