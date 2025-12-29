/**
 * Factory function for creating UserService with dependencies
 * Implements lightweight DI pattern optimized for Cloudflare Workers cold starts
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';
import { UserRepository } from '../repositories/d1/UserRepository';
import { UserService } from '../services/users.service';

export function createUserService(env: Env, logger: Logger): UserService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const userRepo = new UserRepository(db);
  return new UserService(userRepo);
}

