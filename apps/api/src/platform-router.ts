import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { nanoid } from 'nanoid';
import nodemailer from 'nodemailer';
import speakeasy from 'speakeasy';
import { z } from 'zod';

import { createOpaqueToken, hashOpaqueToken, hashPassword, signAccessToken, signRefreshToken, verifyAccessToken, verifyPassword, verifyRefreshToken } from './platform-auth.js';
import { readPlatformDatabase, writePlatformDatabase } from './platform-store.js';
import type { ActivityLogRecord, PlatformDatabase, PostRecord, ProfileRecord, SessionRecord, UserRecord } from './platform-types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(currentDir, '../uploads');
await mkdir(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });
const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

const identifierSchema = z.string().min(3);
const passwordSchema = z.string().min(8).regex(/[A-Z]/, 'Debe incluir mayuscula').regex(/[0-9]/, 'Debe incluir numero');

interface AuthenticatedRequest extends Request {
  user?: UserRecord;
  accessTokenPayload?: { sub: string; email: string; username: string; role: 'user' | 'admin' };
}

function getClientIp(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function getClientDevice(request: Request) {
  return request.get('x-device-name') || 'Current browser';
}

function getRouteParam(request: Request, key: string) {
  const value = request.params[key];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function createCsrfToken() {
  return nanoid(32);
}

function requireCsrf(request: Request, response: Response, next: NextFunction) {
  const cookieToken = request.cookies['csrf-token'];
  const headerToken = request.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    response.status(403).json({ message: 'Token CSRF invalido.' });
    return;
  }

  next();
}

async function sendTransactionalMail(email: string, subject: string, html: string) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? user,
    to: email,
    subject,
    html
  });

  return true;
}

function sanitizeUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    verified: user.verified,
    role: user.role,
    banner: user.banner,
    location: user.location,
    website: user.website,
    socialLinks: user.socialLinks,
    availableForWork: user.availableForWork,
    isPrivate: user.isPrivate,
    twoFactorEnabled: user.twoFactorEnabled
  };
}

function attachActivity(db: PlatformDatabase, entry: ActivityLogRecord) {
  db.activityLogs.unshift(entry);
  db.activityLogs = db.activityLogs.slice(0, 1000);
}

async function resolveAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const authorization = request.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ message: 'Necesitas una cuenta para continuar.' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const db = await readPlatformDatabase();
    const user = db.users.find((item) => item.id === payload.sub);

    if (!user) {
      response.status(401).json({ message: 'Sesion invalida.' });
      return;
    }

    request.user = user;
    request.accessTokenPayload = payload;
    next();
  } catch {
    response.status(401).json({ message: 'Sesion expirada o invalida.' });
  }
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  void resolveAuth(request as AuthenticatedRequest, response, next);
}

function requireRole(role: 'admin') {
  return (request: Request, response: Response, next: NextFunction) => {
    const authRequest = request as AuthenticatedRequest;

    if (authRequest.user?.role !== role) {
      response.status(403).json({ message: 'No autorizado.' });
      return;
    }

    next();
  };
}

async function issueSession(response: Response, db: PlatformDatabase, user: UserRecord, request: Request, rememberMe: boolean) {
  const session: SessionRecord = {
    id: nanoid(),
    userId: user.id,
    refreshTokenHash: '',
    deviceName: getClientDevice(request),
    userAgent: request.get('user-agent') ?? 'unknown',
    ipAddress: getClientIp(request),
    rememberMe,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };

  const opaque = createOpaqueToken();
  session.refreshTokenHash = hashOpaqueToken(opaque);
  db.sessions = [session, ...db.sessions.filter((item) => item.userId !== user.id || item.id !== session.id)];

  const refreshToken = signRefreshToken(session) + '.' + opaque;
  response.cookie('refresh-token', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  });

  return {
    accessToken: signAccessToken(user),
    session
  };
}

async function getCurrentUserAndSession(request: Request) {
  const refreshCookie = request.cookies['refresh-token'];

  if (!refreshCookie || typeof refreshCookie !== 'string') {
    return null;
  }

  const lastDot = refreshCookie.lastIndexOf('.');

  if (lastDot <= 0) {
    return null;
  }

  const jwtPart = refreshCookie.slice(0, lastDot);
  const opaquePart = refreshCookie.slice(lastDot + 1);
  const payload = verifyRefreshToken(jwtPart);
  const db = await readPlatformDatabase();
  const session = db.sessions.find((item) => item.id === payload.sid && item.userId === payload.sub);

  if (!session || session.refreshTokenHash !== hashOpaqueToken(opaquePart)) {
    return null;
  }

  const user = db.users.find((item) => item.id === payload.sub);

  if (!user) {
    return null;
  }

  session.lastSeenAt = new Date().toISOString();
  await writePlatformDatabase(db);
  return { db, session, user };
}

router.get('/auth/csrf', (request, response) => {
  const token = createCsrfToken();
  response.cookie('csrf-token', token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: false
  });
  response.json({ csrfToken: token });
});

router.post('/auth/register', authLimiter, requireCsrf, async (request, response) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    username: z.string().min(3).regex(/^[a-zA-Z0-9_.-]+$/),
    password: passwordSchema,
    confirmPassword: z.string().min(8)
  });
  const payload = schema.parse(request.body);

  if (payload.password !== payload.confirmPassword) {
    response.status(400).json({ message: 'Las contraseñas no coinciden.' });
    return;
  }

  const db = await readPlatformDatabase();

  if (db.users.some((user) => user.email.toLowerCase() === payload.email.toLowerCase())) {
    response.status(409).json({ message: 'Ese email ya existe.' });
    return;
  }

  if (db.users.some((user) => user.username.toLowerCase() === payload.username.toLowerCase())) {
    response.status(409).json({ message: 'Ese username ya existe.' });
    return;
  }

  const timestamp = new Date().toISOString();
  const user: UserRecord = {
    id: nanoid(),
    name: payload.name,
    username: payload.username,
    email: payload.email,
    password: await hashPassword(payload.password),
    avatar: '',
    bio: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    verified: false,
    role: 'user',
    banner: '',
    location: '',
    website: '',
    socialLinks: [],
    availableForWork: true,
    isPrivate: false,
    twoFactorEnabled: false
  };
  const profile: ProfileRecord = {
    userId: user.id,
    contactEmail: payload.email,
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    achievements: [],
    sectionOrder: ['general', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements', 'activity', 'contact']
  };
  const verificationToken = createOpaqueToken();
  db.users.unshift(user);
  db.profiles.unshift(profile);
  db.authTokens.unshift({
    id: nanoid(),
    userId: user.id,
    type: 'email-verification',
    tokenHash: hashOpaqueToken(verificationToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
  attachActivity(db, {
    id: nanoid(),
    userId: user.id,
    type: 'auth.register',
    message: 'Cuenta creada.',
    ipAddress: getClientIp(request),
    userAgent: request.get('user-agent') ?? 'unknown',
    createdAt: timestamp
  });
  await writePlatformDatabase(db);

  const mailSent = await sendTransactionalMail(
    user.email,
    'Verifica tu cuenta',
    `<p>Usa este token para verificar tu cuenta:</p><pre>${verificationToken}</pre>`
  );

  response.status(201).json({
    user: sanitizeUser(user),
    requiresEmailVerification: true,
    verificationPreviewToken: mailSent ? undefined : verificationToken
  });
});

router.post('/auth/login', authLimiter, requireCsrf, async (request, response) => {
  const schema = z.object({
    identifier: identifierSchema,
    password: z.string().min(1),
    rememberMe: z.boolean().default(false),
    twoFactorCode: z.string().optional()
  });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const user = db.users.find(
    (item) => item.email.toLowerCase() === payload.identifier.toLowerCase() || item.username.toLowerCase() === payload.identifier.toLowerCase()
  );

  if (!user || !(await verifyPassword(user.password, payload.password))) {
    response.status(401).json({ message: 'Credenciales invalidas.' });
    return;
  }

  if (user.twoFactorEnabled) {
    if (!payload.twoFactorCode) {
      response.status(428).json({ message: 'Necesitas codigo 2FA.', requiresTwoFactor: true });
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret ?? '',
      encoding: 'base32',
      token: payload.twoFactorCode,
      window: 1
    });

    if (!verified) {
      response.status(401).json({ message: 'Codigo 2FA invalido.' });
      return;
    }
  }

  const tokens = await issueSession(response, db, user, request, payload.rememberMe);
  attachActivity(db, {
    id: nanoid(),
    userId: user.id,
    type: 'auth.login',
    message: 'Inicio de sesion exitoso.',
    ipAddress: getClientIp(request),
    userAgent: request.get('user-agent') ?? 'unknown',
    createdAt: new Date().toISOString()
  });
  await writePlatformDatabase(db);

  response.json({
    accessToken: tokens.accessToken,
    user: sanitizeUser(user),
    requiresEmailVerification: !user.verified
  });
});

router.post('/auth/refresh', async (request, response) => {
  const current = await getCurrentUserAndSession(request);

  if (!current) {
    response.status(401).json({ message: 'No hay sesion activa.' });
    return;
  }

  response.json({
    accessToken: signAccessToken(current.user),
    user: sanitizeUser(current.user)
  });
});

router.post('/auth/logout', requireCsrf, async (request, response) => {
  const current = await getCurrentUserAndSession(request);

  if (current) {
    current.db.sessions = current.db.sessions.filter((session) => session.id !== current.session.id);
    attachActivity(current.db, {
      id: nanoid(),
      userId: current.user.id,
      type: 'auth.logout',
      message: 'Sesion cerrada.',
      ipAddress: getClientIp(request),
      userAgent: request.get('user-agent') ?? 'unknown',
      createdAt: new Date().toISOString()
    });
    await writePlatformDatabase(current.db);
  }

  response.clearCookie('refresh-token');
  response.json({ ok: true });
});

router.get('/auth/me', requireAuth, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const profile = db.profiles.find((item) => item.userId === authRequest.user!.id);
  response.json({ user: sanitizeUser(authRequest.user!), profile });
});

router.post('/auth/verify-email', requireCsrf, async (request, response) => {
  const schema = z.object({ token: z.string().min(10) });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const token = db.authTokens.find(
    (item) => item.type === 'email-verification' && item.tokenHash === hashOpaqueToken(payload.token) && !item.consumedAt
  );

  if (!token || new Date(token.expiresAt).getTime() < Date.now()) {
    response.status(400).json({ message: 'Token invalido o expirado.' });
    return;
  }

  const user = db.users.find((item) => item.id === token.userId);

  if (!user) {
    response.status(404).json({ message: 'Usuario no encontrado.' });
    return;
  }

  user.verified = true;
  user.updatedAt = new Date().toISOString();
  token.consumedAt = new Date().toISOString();
  await writePlatformDatabase(db);
  response.json({ ok: true });
});

router.post('/auth/request-password-reset', authLimiter, requireCsrf, async (request, response) => {
  const schema = z.object({ email: z.string().email() });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.email.toLowerCase() === payload.email.toLowerCase());

  if (!user) {
    response.json({ ok: true });
    return;
  }

  const token = createOpaqueToken();
  db.authTokens.unshift({
    id: nanoid(),
    userId: user.id,
    type: 'password-reset',
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  await writePlatformDatabase(db);
  const mailSent = await sendTransactionalMail(user.email, 'Reset password', `<p>Token:</p><pre>${token}</pre>`);
  response.json({ ok: true, resetPreviewToken: mailSent ? undefined : token });
});

router.post('/auth/reset-password', requireCsrf, async (request, response) => {
  const schema = z.object({ token: z.string().min(10), password: passwordSchema });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const resetToken = db.authTokens.find(
    (item) => item.type === 'password-reset' && item.tokenHash === hashOpaqueToken(payload.token) && !item.consumedAt
  );

  if (!resetToken || new Date(resetToken.expiresAt).getTime() < Date.now()) {
    response.status(400).json({ message: 'Token invalido o expirado.' });
    return;
  }

  const user = db.users.find((item) => item.id === resetToken.userId);

  if (!user) {
    response.status(404).json({ message: 'Usuario no encontrado.' });
    return;
  }

  user.password = await hashPassword(payload.password);
  user.updatedAt = new Date().toISOString();
  resetToken.consumedAt = new Date().toISOString();
  db.sessions = db.sessions.filter((item) => item.userId !== user.id);
  await writePlatformDatabase(db);
  response.json({ ok: true });
});

router.post('/auth/request-magic-link', authLimiter, requireCsrf, async (request, response) => {
  const schema = z.object({ email: z.string().email() });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.email.toLowerCase() === payload.email.toLowerCase());

  if (!user) {
    response.json({ ok: true });
    return;
  }

  const token = createOpaqueToken();
  db.authTokens.unshift({
    id: nanoid(),
    userId: user.id,
    type: 'magic-link',
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
  await writePlatformDatabase(db);
  const mailSent = await sendTransactionalMail(user.email, 'Magic link', `<p>Magic token:</p><pre>${token}</pre>`);
  response.json({ ok: true, magicLinkPreviewToken: mailSent ? undefined : token });
});

router.post('/auth/magic-link/login', requireCsrf, async (request, response) => {
  const schema = z.object({ token: z.string().min(10), rememberMe: z.boolean().default(false) });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const magicToken = db.authTokens.find(
    (item) => item.type === 'magic-link' && item.tokenHash === hashOpaqueToken(payload.token) && !item.consumedAt
  );

  if (!magicToken || new Date(magicToken.expiresAt).getTime() < Date.now()) {
    response.status(400).json({ message: 'Magic link invalido o expirado.' });
    return;
  }

  const user = db.users.find((item) => item.id === magicToken.userId);

  if (!user) {
    response.status(404).json({ message: 'Usuario no encontrado.' });
    return;
  }

  magicToken.consumedAt = new Date().toISOString();
  const tokens = await issueSession(response, db, user, request, payload.rememberMe);
  await writePlatformDatabase(db);
  response.json({ accessToken: tokens.accessToken, user: sanitizeUser(user) });
});

router.post('/auth/2fa/setup', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.id === authRequest.user!.id)!;
  const secret = speakeasy.generateSecret({ name: `MiniN8N (${user.email})` });
  user.twoFactorTempSecret = secret.base32;
  await writePlatformDatabase(db);
  response.json({ otpauthUrl: secret.otpauth_url, manualCode: secret.base32 });
});

router.post('/auth/2fa/verify', requireAuth, requireCsrf, async (request, response) => {
  const schema = z.object({ code: z.string().min(6) });
  const payload = schema.parse(request.body);
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.id === authRequest.user!.id)!;
  const secret = user.twoFactorTempSecret ?? user.twoFactorSecret;

  if (!secret) {
    response.status(400).json({ message: 'No hay setup 2FA pendiente.' });
    return;
  }

  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: payload.code, window: 1 });

  if (!valid) {
    response.status(400).json({ message: 'Codigo 2FA invalido.' });
    return;
  }

  user.twoFactorSecret = secret;
  user.twoFactorTempSecret = undefined;
  user.twoFactorEnabled = true;
  user.updatedAt = new Date().toISOString();
  await writePlatformDatabase(db);
  response.json({ ok: true });
});

router.post('/auth/2fa/disable', requireAuth, requireCsrf, async (request, response) => {
  const schema = z.object({ code: z.string().min(6) });
  const payload = schema.parse(request.body);
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.id === authRequest.user!.id)!;
  const valid = speakeasy.totp.verify({ secret: user.twoFactorSecret ?? '', encoding: 'base32', token: payload.code, window: 1 });

  if (!valid) {
    response.status(400).json({ message: 'Codigo 2FA invalido.' });
    return;
  }

  user.twoFactorSecret = undefined;
  user.twoFactorTempSecret = undefined;
  user.twoFactorEnabled = false;
  await writePlatformDatabase(db);
  response.json({ ok: true });
});

router.get('/auth/sessions', requireAuth, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  response.json(
    db.sessions
      .filter((session) => session.userId === authRequest.user!.id)
      .map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        rememberMe: session.rememberMe,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt
      }))
  );
});

router.delete('/auth/sessions/:sessionId', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  db.sessions = db.sessions.filter((session) => !(session.userId === authRequest.user!.id && session.id === request.params.sessionId));
  await writePlatformDatabase(db);
  response.status(204).send();
});

router.get('/auth/activity', requireAuth, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  response.json(db.activityLogs.filter((entry) => entry.userId === authRequest.user!.id).slice(0, 20));
});

router.get('/auth/oauth/:provider', (request, response) => {
  const provider = request.params.provider;
  const enabled = provider === 'google' ? process.env.GOOGLE_CLIENT_ID : process.env.GITHUB_CLIENT_ID;

  if (!enabled) {
    response.status(501).json({ message: `${provider} OAuth requiere configurar credenciales en variables de entorno.` });
    return;
  }

  response.status(501).json({ message: `${provider} OAuth callback scaffolded. Configura provider real para activarlo.` });
});

router.get('/profile/me', requireAuth, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.id === authRequest.user!.id)!;
  const profile = db.profiles.find((item) => item.userId === user.id)!;
  const followerCount = db.followers.filter((entry) => entry.followingUserId === user.id).length;
  const followingCount = db.followers.filter((entry) => entry.followerUserId === user.id).length;
  const posts = db.posts.filter((post) => post.userId === user.id);
  response.json({ user: sanitizeUser(user), profile, followerCount, followingCount, posts });
});

router.put('/profile/me', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const schema = z.object({
    name: z.string().min(2),
    bio: z.string().default(''),
    location: z.string().default(''),
    website: z.string().default(''),
    avatar: z.string().default(''),
    banner: z.string().default(''),
    socialLinks: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    availableForWork: z.boolean().default(true),
    isPrivate: z.boolean().default(false),
    contactEmail: z.string().email(),
    experiences: z.array(z.object({ id: z.string(), company: z.string(), role: z.string(), startDate: z.string(), endDate: z.string(), description: z.string() })).default([]),
    education: z.array(z.object({ id: z.string(), school: z.string(), degree: z.string(), startDate: z.string(), endDate: z.string(), description: z.string() })).default([]),
    skills: z.array(z.object({ id: z.string(), name: z.string(), level: z.string() })).default([]),
    projects: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), image: z.string(), link: z.string() })).default([]),
    certifications: z.array(z.object({ id: z.string(), title: z.string(), issuer: z.string(), issuedAt: z.string(), link: z.string() })).default([]),
    achievements: z.array(z.object({ id: z.string(), title: z.string(), description: z.string() })).default([]),
    sectionOrder: z.array(z.string()).default([])
  });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const user = db.users.find((item) => item.id === authRequest.user!.id)!;
  const profile = db.profiles.find((item) => item.userId === user.id)!;
  user.name = payload.name;
  user.bio = payload.bio;
  user.location = payload.location;
  user.website = payload.website;
  user.avatar = payload.avatar;
  user.banner = payload.banner;
  user.socialLinks = payload.socialLinks;
  user.availableForWork = payload.availableForWork;
  user.isPrivate = payload.isPrivate;
  user.updatedAt = new Date().toISOString();
  profile.contactEmail = payload.contactEmail;
  profile.experiences = payload.experiences;
  profile.education = payload.education;
  profile.skills = payload.skills;
  profile.projects = payload.projects;
  profile.certifications = payload.certifications;
  profile.achievements = payload.achievements;
  profile.sectionOrder = payload.sectionOrder;
  await writePlatformDatabase(db);
  response.json({ user: sanitizeUser(user), profile });
});

router.post('/profile/media', requireAuth, requireCsrf, upload.single('file'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ message: 'Archivo requerido.' });
    return;
  }

  response.json({ url: `/uploads/${request.file.filename}` });
});

router.get('/profile/:username/public', async (request, response) => {
  const db = await readPlatformDatabase();
  const username = getRouteParam(request, 'username').toLowerCase();
  const user = db.users.find((item) => item.username.toLowerCase() === username);

  if (!user) {
    response.status(404).json({ message: 'Perfil no encontrado.' });
    return;
  }

  const authHeader = request.get('authorization');
  const isOwner = (() => {
    try {
      if (!authHeader?.startsWith('Bearer ')) {
        return false;
      }

      return verifyAccessToken(authHeader.slice(7)).sub === user.id;
    } catch {
      return false;
    }
  })();

  if (user.isPrivate && !isOwner) {
    response.status(403).json({ message: 'Este perfil es privado.' });
    return;
  }

  const profile = db.profiles.find((item) => item.userId === user.id)!;
  const posts = db.posts.filter((post) => post.userId === user.id);
  const followerCount = db.followers.filter((entry) => entry.followingUserId === user.id).length;
  const followingCount = db.followers.filter((entry) => entry.followerUserId === user.id).length;
  db.profileViews.unshift({ id: nanoid(), profileUserId: user.id, createdAt: new Date().toISOString() });
  await writePlatformDatabase(db);
  response.json({ user: sanitizeUser(user), profile, posts, followerCount, followingCount });
});

router.post('/profile/:username/follow', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const username = getRouteParam(request, 'username').toLowerCase();
  const target = db.users.find((item) => item.username.toLowerCase() === username);

  if (!target || target.id === authRequest.user!.id) {
    response.status(400).json({ message: 'No se puede seguir este perfil.' });
    return;
  }

  const exists = db.followers.find((item) => item.followerUserId === authRequest.user!.id && item.followingUserId === target.id);

  if (!exists) {
    db.followers.unshift({ id: nanoid(), followerUserId: authRequest.user!.id, followingUserId: target.id, createdAt: new Date().toISOString() });
    await writePlatformDatabase(db);
  }

  response.json({ ok: true });
});

router.delete('/profile/:username/follow', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const username = getRouteParam(request, 'username').toLowerCase();
  const target = db.users.find((item) => item.username.toLowerCase() === username);

  if (!target) {
    response.status(404).json({ message: 'Perfil no encontrado.' });
    return;
  }

  db.followers = db.followers.filter((item) => !(item.followerUserId === authRequest.user!.id && item.followingUserId === target.id));
  await writePlatformDatabase(db);
  response.status(204).send();
});

router.post('/profile/posts', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const schema = z.object({ content: z.string().min(2) });
  const payload = schema.parse(request.body);
  const db = await readPlatformDatabase();
  const post: PostRecord = {
    id: nanoid(),
    userId: authRequest.user!.id,
    content: payload.content,
    createdAt: new Date().toISOString(),
    likes: [],
    comments: []
  };
  db.posts.unshift(post);
  await writePlatformDatabase(db);
  response.status(201).json(post);
});

router.post('/profile/posts/:postId/like', requireAuth, requireCsrf, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const post = db.posts.find((item) => item.id === request.params.postId);

  if (!post) {
    response.status(404).json({ message: 'Post no encontrado.' });
    return;
  }

  if (post.likes.includes(authRequest.user!.id)) {
    post.likes = post.likes.filter((item) => item !== authRequest.user!.id);
  } else {
    post.likes.push(authRequest.user!.id);
  }

  await writePlatformDatabase(db);
  response.json(post);
});

router.get('/profile/ranking', async (_request, response) => {
  const db = await readPlatformDatabase();
  const ranking = db.users
    .map((user) => ({
      username: user.username,
      name: user.name,
      score:
        db.followers.filter((item) => item.followingUserId === user.id).length * 3 +
        db.profileViews.filter((item) => item.profileUserId === user.id).length +
        db.posts.filter((post) => post.userId === user.id).reduce((sum, post) => sum + post.likes.length, 0)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  response.json(ranking);
});

router.get('/profile/skills/recommendations/me', requireAuth, async (request, response) => {
  const authRequest = request as AuthenticatedRequest;
  const db = await readPlatformDatabase();
  const profile = db.profiles.find((item) => item.userId === authRequest.user!.id)!;
  const text = [
    ...profile.experiences.map((item) => `${item.role} ${item.description}`),
    ...profile.projects.map((item) => `${item.title} ${item.description}`)
  ].join(' ').toLowerCase();
  const catalog = ['typescript', 'react', 'node.js', 'postgresql', 'product design', 'automation', 'api design'];
  const suggestions = catalog.filter((skill) => text.includes(skill.split('.')[0])).slice(0, 5);
  response.json(suggestions);
});

router.get('/admin/users', requireAuth, requireRole('admin'), async (_request, response) => {
  const db = await readPlatformDatabase();
  response.json(db.users.map(sanitizeUser));
});

export default router;