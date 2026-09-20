import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/index';

describe('PIN approval flow', () => {
  const app = createApp();

  // Helper to start a command that requires device verification.
  async function startDeviceVerification() {
    const res = await request(app).post('/api/command').send({
      capability: 'secrets.reveal',
      input: { name: 'DB_PASSWORD' },
      origin: 'local',
      actor: 'tester@demo',
    });
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('approval_required');
    const challengeId = res.body.approvals[0].challengeId as string;
    return challengeId;
  }

  it('allows correct PIN', async () => {
    const challengeId = await startDeviceVerification();
    const pinRes = await request(app).post(`/api/approval/${challengeId}/pin`).send({ pin: '2468' });
    expect(pinRes.status).toBe(200);
    expect(pinRes.body.decision).toBe('allowed');
  });

  it('rejects wrong PIN', async () => {
    const challengeId = await startDeviceVerification();
    const pinRes = await request(app).post(`/api/approval/${challengeId}/pin`).send({ pin: '0000' });
    expect(pinRes.status).toBe(403);
    expect(pinRes.body.error).toBe('Invalid PIN');
  });
});
