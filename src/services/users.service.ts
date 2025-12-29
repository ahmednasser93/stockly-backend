/**
 * User Service
 * Contains business logic for user operations
 */

import type { IUserRepository } from '../repositories/interfaces/IUserRepository';
import type { User, UpdateUserProfileRequest } from '@stockly/shared/types';

export class UserService {
  constructor(private userRepo: IUserRepository) {}

  /**
   * Update user profile with business logic validation
   * Validates username uniqueness before updating
   */
  async updateProfile(userId: string, data: UpdateUserProfileRequest): Promise<User> {
    // Business logic: validate username uniqueness if username is being updated
    if (data.username) {
      const existing = await this.userRepo.findByUsername(data.username);
      if (existing && existing.id !== userId) {
        throw new Error('Username already taken');
      }
    }

    return this.userRepo.update(userId, data);
  }

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<User | null> {
    return this.userRepo.findById(userId);
  }

  /**
   * Get user profile by username
   */
  async getProfileByUsername(username: string): Promise<User | null> {
    return this.userRepo.findByUsername(username);
  }
}

