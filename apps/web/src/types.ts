import type { Node } from '@xyflow/react';

export type WorkflowNodeType =
  | 'manualTrigger'
  | 'transform'
  | 'wait'
  | 'httpRequest'
  | 'discordWebhook'
  | 'gmailSmtp';

export interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'password' | 'select';
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  runtimeOnly?: boolean;
}

export interface ConnectorDefinition {
  type: WorkflowNodeType;
  label: string;
  accent: string;
  description: string;
  defaults: Record<string, unknown>;
  fields: ConnectorField[];
}

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: WorkflowNodeType;
  label: string;
  accent?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface PersistedWorkflowNodeData {
  label: string;
  accent?: string;
  description?: string;
  config: Record<string, unknown>;
}

export type CanvasNode = Node<WorkflowNodeData, 'automation'>;

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: WorkflowNodeType;
    position: { x: number; y: number };
    data: PersistedWorkflowNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'success' | 'failed';
  startedAt: string;
  finishedAt: string;
  steps: Array<{
    nodeId: string;
    nodeType: WorkflowNodeType;
    label: string;
    status: 'success' | 'failed';
    durationMs: number;
    output?: unknown;
    error?: string;
  }>;
  finalOutput: unknown;
}

export interface ChatHistoryEntry {
  id: string;
  executionId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  channel: 'manualTrigger' | 'discordWebhook' | 'gmailSmtp';
  direction: 'inbound' | 'outbound';
  status: 'success' | 'failed';
  summary: string;
  recipient?: string;
  payload: unknown;
  createdAt: string;
}

export interface RuntimeCredentials {
  [nodeId: string]: Record<string, string>;
}

export interface RequestContext {
  accessToken?: string;
  csrfToken?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  role: 'user' | 'admin';
  banner: string;
  location: string;
  website: string;
  socialLinks: Array<{ label: string; url: string }>;
  availableForWork: boolean;
  isPrivate: boolean;
  twoFactorEnabled: boolean;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface SkillItem {
  id: string;
  name: string;
  level: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  image: string;
  link: string;
}

export interface CertificationItem {
  id: string;
  title: string;
  issuer: string;
  issuedAt: string;
  link: string;
}

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
}

export interface UserProfile {
  userId: string;
  contactEmail: string;
  experiences: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  achievements: AchievementItem[];
  sectionOrder: string[];
}

export interface SessionInfo {
  id: string;
  deviceName: string;
  userAgent: string;
  ipAddress: string;
  rememberMe: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface ActivityLog {
  id: string;
  userId?: string;
  type: string;
  message: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface ProfilePost {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  likes: string[];
  comments: Array<{ id: string; userId: string; content: string; createdAt: string }>;
}

export interface AuthSessionResponse {
  accessToken: string;
  user: AuthUser;
  requiresEmailVerification?: boolean;
}

export interface ProfileBundle {
  user: AuthUser;
  profile: UserProfile;
  followerCount: number;
  followingCount: number;
  posts: ProfilePost[];
}
