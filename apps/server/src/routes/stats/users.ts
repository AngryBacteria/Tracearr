/**
 * User Statistics Routes
 *
 * GET /users - User statistics with play counts
 * GET /top-users - User leaderboard by watch time
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { statsQuerySchema } from '@tracearr/shared';
import { db } from '../../db/client.js';
import { getDateRange } from './utils.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /users - User statistics
   */
  app.get(
    '/users',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = statsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { period } = query.data;
      const startDate = getDateRange(period);

      // Use raw query with proper play counting (DISTINCT reference_id)
      const result = await db.execute(sql`
        SELECT
          u.id as user_id,
          u.username,
          u.thumb_url,
          COUNT(DISTINCT COALESCE(s.reference_id, s.id))::int as play_count,
          COALESCE(SUM(s.duration_ms), 0)::bigint as watch_time_ms
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= ${startDate}
        GROUP BY u.id, u.username, u.thumb_url
        ORDER BY play_count DESC
        LIMIT 20
      `);
      const userStats = (result.rows as {
        user_id: string;
        username: string;
        thumb_url: string | null;
        play_count: number;
        watch_time_ms: string;
      }[]).map((r) => ({
        userId: r.user_id,
        username: r.username,
        thumbUrl: r.thumb_url,
        playCount: r.play_count,
        watchTimeMs: Number(r.watch_time_ms),
      }));

      return {
        data: userStats.map((u) => ({
          userId: u.userId,
          username: u.username,
          thumbUrl: u.thumbUrl,
          playCount: u.playCount,
          watchTimeHours: Math.round((u.watchTimeMs / (1000 * 60 * 60)) * 10) / 10,
        })),
      };
    }
  );

  /**
   * GET /top-users - User leaderboard
   */
  app.get(
    '/top-users',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = statsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { period } = query.data;
      const startDate = getDateRange(period);

      // Use raw query with proper play counting (DISTINCT reference_id)
      // Include server_id for avatar proxy and top genre/show
      const topUsersResult = await db.execute(sql`
        SELECT
          u.id as user_id,
          u.username,
          u.thumb_url,
          u.server_id::text,
          u.trust_score,
          COUNT(DISTINCT COALESCE(s.reference_id, s.id))::int as play_count,
          COALESCE(SUM(s.duration_ms), 0)::bigint as watch_time_ms,
          MODE() WITHIN GROUP (ORDER BY s.media_type) as top_media_type,
          MODE() WITHIN GROUP (ORDER BY COALESCE(s.grandparent_title, s.media_title)) as top_content
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= ${startDate}
        GROUP BY u.id, u.username, u.thumb_url, u.server_id, u.trust_score
        ORDER BY watch_time_ms DESC
        LIMIT 10
      `);
      const topUsers = (topUsersResult.rows as {
        user_id: string;
        username: string;
        thumb_url: string | null;
        server_id: string | null;
        trust_score: number;
        play_count: number;
        watch_time_ms: string;
        top_media_type: string | null;
        top_content: string | null;
      }[]).map((r) => ({
        userId: r.user_id,
        username: r.username,
        thumbUrl: r.thumb_url,
        serverId: r.server_id,
        trustScore: r.trust_score,
        playCount: r.play_count,
        watchTimeMs: Number(r.watch_time_ms),
        topMediaType: r.top_media_type,
        topContent: r.top_content,
      }));

      return {
        data: topUsers.map((u) => ({
          userId: u.userId,
          username: u.username,
          thumbUrl: u.thumbUrl,
          serverId: u.serverId,
          trustScore: u.trustScore,
          playCount: u.playCount,
          watchTimeHours: Math.round((u.watchTimeMs / (1000 * 60 * 60)) * 10) / 10,
          topMediaType: u.topMediaType, // "movie", "episode", etc.
          topContent: u.topContent, // Most watched show/movie name
        })),
      };
    }
  );
};
