export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  email: string;
  password: string;
  avatar: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  role: UserRole;
  banner: string;
  location: string;
  website: string;
  socialLinks: Array<{ label: string; url: string }>;
  availableForWork: boolean;
  isPrivate: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorTempSecret?: string;
}

export interface ExperienceRecord {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface EducationRecord {
  id: string;
  school: string;
  degree: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  level: string;
}

export interface ProjectRecord {
  id: string;
  title: string;
  description: string;
  image: string;
  link: string;
}

export interface CertificationRecord {
  id: string;
  title: string;
  issuer: string;
  issuedAt: string;
  link: string;
}

export interface AchievementRecord {
  id: string;
  title: string;
  description: string;
}

export interface ProfileRecord {
  userId: string;
  contactEmail: string;
  experiences: ExperienceRecord[];
  education: EducationRecord[];
  skills: SkillRecord[];
  projects: ProjectRecord[];
  certifications: CertificationRecord[];
  achievements: AchievementRecord[];
  sectionOrder: string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName: string;
  userAgent: string;
  ipAddress: string;
  rememberMe: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface AuthTokenRecord {
  id: string;
  userId: string;
  type: 'email-verification' | 'password-reset' | 'magic-link';
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface ActivityLogRecord {
  id: string;
  userId?: string;
  type: string;
  message: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface PostRecord {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  likes: string[];
  comments: Array<{ id: string; userId: string; content: string; createdAt: string }>;
}

export interface FollowerRecord {
  id: string;
  followerUserId: string;
  followingUserId: string;
  createdAt: string;
}

export interface ProfileViewRecord {
  id: string;
  profileUserId: string;
  viewerUserId?: string;
  createdAt: string;
}

export interface PlatformDatabase {
  users: UserRecord[];
  profiles: ProfileRecord[];
  sessions: SessionRecord[];
  authTokens: AuthTokenRecord[];
  activityLogs: ActivityLogRecord[];
  posts: PostRecord[];
  followers: FollowerRecord[];
  profileViews: ProfileViewRecord[];
}
