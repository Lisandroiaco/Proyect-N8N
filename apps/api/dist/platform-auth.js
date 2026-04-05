import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
const accessSecret = process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret';
export function hashOpaqueToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export function createOpaqueToken() {
    return nanoid(48);
}
export async function hashPassword(password) {
    return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 3,
        parallelism: 1
    });
}
export async function verifyPassword(hash, password) {
    return argon2.verify(hash, password);
}
export function signAccessToken(user) {
    return jwt.sign({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role
    }, accessSecret, {
        expiresIn: '15m'
    });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, accessSecret);
}
export function signRefreshToken(session) {
    return jwt.sign({
        sid: session.id,
        sub: session.userId
    }, refreshSecret, {
        expiresIn: session.rememberMe ? '30d' : '1d'
    });
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, refreshSecret);
}
