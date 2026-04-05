import crypto from 'node:crypto';

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

import type { SessionRecord, UserRecord, UserRole } from './platform-types.js';

const accessSecret = process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: UserRole;
}

export function hashOpaqueToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return nanoid(48);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function signAccessToken(user: UserRecord) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    } satisfies AccessTokenPayload,
    accessSecret,
    {
      expiresIn: '15m'
    }
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret) as AccessTokenPayload;
}

export function signRefreshToken(session: SessionRecord) {
  return jwt.sign(
    {
      sid: session.id,
      sub: session.userId
    },
    refreshSecret,
    {
      expiresIn: session.rememberMe ? '30d' : '1d'
    }
  );
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret) as { sid: string; sub: string };
}
