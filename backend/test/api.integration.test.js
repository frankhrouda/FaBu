import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

const dbPath = path.resolve(process.cwd(), 'data/fabu-integration-test.db');

process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'integration-test-secret';

for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  } catch {
    // Ignore if files do not exist.
  }
}

const { createApp } = await import('../src/app.js');

let app;
let superAdminToken;
let alphaTenantId;
let alphaAdminToken;
let alphaUserToken;

beforeAll(async () => {
  app = await createApp();

  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Root Admin',
      email: 'root@example.test',
      password: 'Secret123!',
    })
    .expect(201);

  superAdminToken = registerRes.body.token;
  alphaTenantId = registerRes.body.user.active_tenant_id;

  const createdAdminRes = await request(app)
    .post(`/api/admin/tenants/${alphaTenantId}/members`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({
      name: 'Alpha Tenant Admin',
      email: 'alpha-admin@example.test',
      password: 'Secret123!',
      role: 'admin',
    })
    .expect(201);

  expect(createdAdminRes.body.user.tenant_role).toBe('admin');

  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'alpha-admin@example.test',
      password: 'Secret123!',
    })
    .expect(200);

  alphaAdminToken = adminLoginRes.body.token;
});

describe('API integration: auth, tenant roles, invitations', () => {
  it('register returns superadmin and tenant context for first user', async () => {
    expect(superAdminToken).toBeTruthy();
    expect(alphaTenantId).toBeTypeOf('number');
  });

  it('creates and rejects duplicate pending tenant admin requests', async () => {
    const payload = {
      name: 'Incoming Admin',
      email: 'incoming@example.test',
      tenant_name: 'Incoming Tenant',
      password: 'Secret123!',
      message: 'Bitte freischalten',
    };

    const first = await request(app)
      .post('/api/auth/tenant-admin-requests')
      .send(payload)
      .expect(201);

    expect(first.body.request.status).toBe('pending');

    const second = await request(app)
      .post('/api/auth/tenant-admin-requests')
      .send(payload)
      .expect(409);

    expect(second.body.error).toMatch(/offene Anfrage/i);
  });

  it('allows tenant admin to create invitation and user to register with invite', async () => {
    const invitationRes = await request(app)
      .post(`/api/tenants/${alphaTenantId}/invitations`)
      .set('Authorization', `Bearer ${alphaAdminToken}`)
      .send({
        email: 'alpha-user@example.test',
        expires_in_hours: 24,
      })
      .expect(201);

    const code = invitationRes.body.invitation.code;
    expect(code).toBeTruthy();

    const registerInviteRes = await request(app)
      .post('/api/auth/register-with-invite')
      .send({
        code,
        name: 'Alpha User',
        email: 'alpha-user@example.test',
        password: 'Secret123!',
      })
      .expect(201);

    alphaUserToken = registerInviteRes.body.token;
    expect(registerInviteRes.body.user.super_admin).toBe(false);
    expect(registerInviteRes.body.user.active_tenant_id).toBe(alphaTenantId);
  });

  it('forbids non-superadmin from creating tenants under /admin', async () => {
    const forbidden = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${alphaAdminToken}`)
      .send({ name: 'Should Not Work' })
      .expect(403);

    expect(forbidden.body.error).toMatch(/Super-Admin/i);
  });

  it('forbids normal tenant user from creating invitations', async () => {
    const forbidden = await request(app)
      .post(`/api/tenants/${alphaTenantId}/invitations`)
      .set('Authorization', `Bearer ${alphaUserToken}`)
      .send({ email: 'not-allowed@example.test' })
      .expect(403);

    expect(forbidden.body.error).toMatch(/Administratorrechte/i);
  });
});
