/**
 * Setup routes unit tests
 *
 * Tests the API endpoint for checking Tracearr configuration status:
 * - GET /status - Check if setup is needed
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

// Mock the database module before importing routes
vi.mock('../../db/client.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

// Import the mocked db and the routes
import { db } from '../../db/client.js';
import { setupRoutes } from '../setup.js';

/**
 * Helper to mock db.select with multiple chained calls
 * Setup route uses Promise.all with 3 parallel queries
 */
function mockDbSelectMultiple(results: unknown[][]) {
  let callIndex = 0;
  const createChain = () => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      return Promise.resolve(results[callIndex++] || []);
    }),
  });

  vi.mocked(db.select).mockImplementation(() => createChain() as never);
}

/**
 * Build a test Fastify instance
 * Note: Setup routes are public (no auth required)
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Register sensible for HTTP error helpers
  await app.register(sensible);

  // Register routes
  await app.register(setupRoutes, { prefix: '/setup' });

  return app;
}

describe('Setup Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /setup/status', () => {
    it('returns needsSetup true when no owners exist', async () => {
      app = await buildTestApp();

      // Mock: servers exist, no owners, no password users
      mockDbSelectMultiple([
        [{ id: 'server-1' }], // servers query
        [], // owners query (empty = needs setup)
        [], // password users query
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: true,
        hasServers: true,
        hasPasswordAuth: false,
      });
    });

    it('returns needsSetup false when owner exists', async () => {
      app = await buildTestApp();

      // Mock: servers exist, owner exists, password user exists
      mockDbSelectMultiple([
        [{ id: 'server-1' }], // servers query
        [{ id: 'user-1' }], // owners query (has owner)
        [{ id: 'user-1' }], // password users query
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: false,
        hasServers: true,
        hasPasswordAuth: true,
      });
    });

    it('returns hasServers false when no servers configured', async () => {
      app = await buildTestApp();

      // Mock: no servers, no owners, no password users
      mockDbSelectMultiple([
        [], // servers query (empty)
        [], // owners query
        [], // password users query
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: true,
        hasServers: false,
        hasPasswordAuth: false,
      });
    });

    it('returns hasPasswordAuth true when user has password set', async () => {
      app = await buildTestApp();

      // Mock: no servers, owner exists, password user exists
      mockDbSelectMultiple([
        [], // servers query
        [{ id: 'user-1' }], // owners query
        [{ id: 'user-1' }], // password users query (has password)
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: false,
        hasServers: false,
        hasPasswordAuth: true,
      });
    });

    it('returns hasPasswordAuth false when no users have passwords', async () => {
      app = await buildTestApp();

      // Mock: servers exist, owner exists, no password users
      mockDbSelectMultiple([
        [{ id: 'server-1' }], // servers query
        [{ id: 'user-1' }], // owners query
        [], // password users query (empty)
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: false,
        hasServers: true,
        hasPasswordAuth: false,
      });
    });

    it('handles fresh installation state correctly', async () => {
      app = await buildTestApp();

      // Mock: completely empty database
      mockDbSelectMultiple([
        [], // no servers
        [], // no owners
        [], // no password users
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: true,
        hasServers: false,
        hasPasswordAuth: false,
      });
    });

    it('handles fully configured state correctly', async () => {
      app = await buildTestApp();

      // Mock: fully configured installation
      mockDbSelectMultiple([
        [{ id: 'server-1' }, { id: 'server-2' }], // multiple servers
        [{ id: 'owner-1' }], // owner exists
        [{ id: 'owner-1' }, { id: 'user-2' }], // multiple password users
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/setup/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        needsSetup: false,
        hasServers: true,
        hasPasswordAuth: true,
      });
    });
  });
});
