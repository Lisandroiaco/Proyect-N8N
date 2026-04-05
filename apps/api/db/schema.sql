create table if not exists users (
  id text primary key,
  name text not null,
  username text not null unique,
  email text not null unique,
  password text not null,
  avatar text not null default '',
  bio text not null default '',
  banner text not null default '',
  location text not null default '',
  website text not null default '',
  social_links jsonb not null default '[]'::jsonb,
  available_for_work boolean not null default true,
  is_private boolean not null default false,
  verified boolean not null default false,
  role text not null default 'user',
  two_factor_enabled boolean not null default false,
  two_factor_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id text primary key references users(id) on delete cascade,
  contact_email text not null,
  experiences jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  achievements jsonb not null default '[]'::jsonb,
  section_order jsonb not null default '[]'::jsonb
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  refresh_token_hash text not null,
  device_name text not null,
  user_agent text not null,
  ip_address text not null,
  remember_me boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists auth_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists posts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  content text not null,
  likes jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists followers (
  id text primary key,
  follower_user_id text not null references users(id) on delete cascade,
  following_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists profile_views (
  id text primary key,
  profile_user_id text not null references users(id) on delete cascade,
  viewer_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id text primary key,
  user_id text references users(id) on delete set null,
  type text not null,
  message text not null,
  ip_address text not null,
  user_agent text not null,
  created_at timestamptz not null default now()
);