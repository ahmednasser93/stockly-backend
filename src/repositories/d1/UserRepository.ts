/**
 * User Repository Implementation using D1 Database
 * Implements IUserRepository interface using IDatabase abstraction
 */

import type { IUserRepository } from '../interfaces/IUserRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { User, UpdateUserProfileRequest } from '@stockly/shared/types';

export class UserRepository implements IUserRepository {
  constructor(private db: IDatabase) {}

  async findById(userId: string): Promise<User | null> {
    const result = await this.db
      .prepare('SELECT id, email, username, name, created_at, updated_at FROM users WHERE id = ?')
      .bind(userId)
      .first<{
        id: string;
        email: string;
        username: string | null;
        name: string | null;
        created_at: number;
        updated_at: number;
      }>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      username: result.username,
      name: result.name,
      createdAt: new Date(result.created_at * 1000).toISOString(),
      updatedAt: new Date(result.updated_at * 1000).toISOString(),
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db
      .prepare('SELECT id, email, username, name, created_at, updated_at FROM users WHERE LOWER(username) = LOWER(?)')
      .bind(username)
      .first<{
        id: string;
        email: string;
        username: string | null;
        name: string | null;
        created_at: number;
        updated_at: number;
      }>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      username: result.username,
      name: result.name,
      createdAt: new Date(result.created_at * 1000).toISOString(),
      updatedAt: new Date(result.updated_at * 1000).toISOString(),
    };
  }

  async update(userId: string, data: UpdateUserProfileRequest): Promise<User> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.username !== undefined) {
      updates.push('username = ?');
      values.push(data.username);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (updates.length === 0) {
      // No updates, return current user
      const user = await this.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    }

    // Add updated_at timestamp
    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));

    // Add userId for WHERE clause
    values.push(userId);

    await this.db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const updatedUser = await this.findById(userId);
    if (!updatedUser) {
      throw new Error('User not found after update');
    }

    return updatedUser;
  }
}

