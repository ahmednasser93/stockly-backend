/**
 * User Repository Interface
 * Defines the contract for user data access operations
 */

import type { User, UpdateUserProfileRequest } from '@stockly/shared/types';

export interface IUserRepository {
  findById(userId: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(userId: string, data: UpdateUserProfileRequest): Promise<User>;
}

