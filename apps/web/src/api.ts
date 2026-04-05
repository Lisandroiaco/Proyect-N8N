import type {
  ActivityLog,
  AuthSessionResponse,
  ChatHistoryEntry,
  ConnectorDefinition,
  ProfileBundle,
  ProfilePost,
  RequestContext,
  RuntimeCredentials,
  SessionInfo,
  WorkflowDefinition,
  WorkflowExecutionResult
} from './types';

function withSecurityHeaders(init: RequestInit | undefined, context: RequestContext | undefined) {
  return {
    'Content-Type': 'application/json',
    ...(context?.accessToken ? { Authorization: `Bearer ${context.accessToken}` } : {}),
    ...(context?.csrfToken ? { 'x-csrf-token': context.csrfToken } : {}),
    ...(init?.headers ?? {})
  };
}

async function request<T>(path: string, init?: RequestInit, context?: RequestContext): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      ...withSecurityHeaders(init, context)
    },
    ...init
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const errorBody = (await response.json()) as { message?: string };
      throw new Error(errorBody.message || `Request failed with ${response.status}`);
    }

    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function fetchConnectors() {
  return request<ConnectorDefinition[]>('/api/connectors');
}

export function fetchWorkflows(context: RequestContext) {
  return request<WorkflowDefinition[]>('/api/workflows', undefined, context);
}

export function fetchChatHistory(context: RequestContext) {
  return request<ChatHistoryEntry[]>('/api/chat-history', undefined, context);
}

export function saveWorkflow(workflow: Partial<WorkflowDefinition>, context: RequestContext) {
  return request<WorkflowDefinition>('/api/workflows', {
    method: 'POST',
    body: JSON.stringify(workflow)
  }, context);
}

export function executeWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  credentials: RuntimeCredentials,
  context: RequestContext
) {
  return request<WorkflowExecutionResult>(`/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ input, credentials })
  }, context);
}

export function deleteWorkflow(workflowId: string, context: RequestContext) {
  return request<void>(`/api/workflows/${workflowId}`, {
    method: 'DELETE'
  }, context);
}

export function fetchCsrfToken() {
  return request<{ csrfToken: string }>('/api/auth/csrf');
}

export function registerUser(payload: Record<string, unknown>, context: RequestContext) {
  return request<{ user: AuthSessionResponse['user']; requiresEmailVerification: boolean; verificationPreviewToken?: string }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    context
  );
}

export function loginUser(payload: Record<string, unknown>, context: RequestContext) {
  return request<AuthSessionResponse & { requiresTwoFactor?: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, context);
}

export function refreshSession() {
  return request<AuthSessionResponse>('/api/auth/refresh', { method: 'POST' });
}

export function logoutUser(context: RequestContext) {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' }, context);
}

export function fetchMe(context: RequestContext) {
  return request<{ user: AuthSessionResponse['user']; profile: ProfileBundle['profile'] }>('/api/auth/me', undefined, context);
}

export function verifyEmailToken(token: string, context: RequestContext) {
  return request<{ ok: true }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }, context);
}

export function requestPasswordReset(email: string, context: RequestContext) {
  return request<{ ok: true; resetPreviewToken?: string }>('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) }, context);
}

export function resetPassword(payload: Record<string, string>, context: RequestContext) {
  return request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }, context);
}

export function requestMagicLink(email: string, context: RequestContext) {
  return request<{ ok: true; magicLinkPreviewToken?: string }>('/api/auth/request-magic-link', { method: 'POST', body: JSON.stringify({ email }) }, context);
}

export function loginWithMagicToken(token: string, rememberMe: boolean, context: RequestContext) {
  return request<AuthSessionResponse>('/api/auth/magic-link/login', { method: 'POST', body: JSON.stringify({ token, rememberMe }) }, context);
}

export function setupTwoFactor(context: RequestContext) {
  return request<{ otpauthUrl: string; manualCode: string }>('/api/auth/2fa/setup', { method: 'POST' }, context);
}

export function verifyTwoFactor(code: string, context: RequestContext) {
  return request<{ ok: true }>('/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }, context);
}

export function disableTwoFactor(code: string, context: RequestContext) {
  return request<{ ok: true }>('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }, context);
}

export function fetchSessions(context: RequestContext) {
  return request<SessionInfo[]>('/api/auth/sessions', undefined, context);
}

export function revokeSession(sessionId: string, context: RequestContext) {
  return request<void>(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' }, context);
}

export function fetchActivity(context: RequestContext) {
  return request<ActivityLog[]>('/api/auth/activity', undefined, context);
}

export function fetchOAuth(provider: 'google' | 'github') {
  return request<{ message: string }>(`/api/auth/oauth/${provider}`);
}

export function fetchMyProfile(context: RequestContext) {
  return request<ProfileBundle>('/api/profile/me', undefined, context);
}

export function updateMyProfile(payload: Record<string, unknown>, context: RequestContext) {
  return request<ProfileBundle>('/api/profile/me', { method: 'PUT', body: JSON.stringify(payload) }, context);
}

export async function uploadProfileMedia(file: File, context: RequestContext) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/profile/media', {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(context.accessToken ? { Authorization: `Bearer ${context.accessToken}` } : {}),
      ...(context.csrfToken ? { 'x-csrf-token': context.csrfToken } : {})
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ url: string }>;
}

export function fetchPublicProfile(username: string, context?: RequestContext) {
  return request<ProfileBundle>(`/api/profile/${username}/public`, undefined, context);
}

export function followProfile(username: string, context: RequestContext) {
  return request<{ ok: true }>(`/api/profile/${username}/follow`, { method: 'POST' }, context);
}

export function unfollowProfile(username: string, context: RequestContext) {
  return request<void>(`/api/profile/${username}/follow`, { method: 'DELETE' }, context);
}

export function createPost(content: string, context: RequestContext) {
  return request<ProfilePost>('/api/profile/posts', { method: 'POST', body: JSON.stringify({ content }) }, context);
}

export function toggleLike(postId: string, context: RequestContext) {
  return request<ProfilePost>(`/api/profile/posts/${postId}/like`, { method: 'POST' }, context);
}

export function fetchRanking() {
  return request<Array<{ username: string; name: string; score: number }>>('/api/profile/ranking');
}

export function fetchSkillRecommendations(context: RequestContext) {
  return request<string[]>('/api/profile/skills/recommendations/me', undefined, context);
}
