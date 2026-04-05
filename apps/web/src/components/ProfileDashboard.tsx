import { useEffect, useMemo, useState } from 'react';

import { createPost, fetchMyProfile, fetchPublicProfile, fetchRanking, fetchSkillRecommendations, followProfile, toggleLike, unfollowProfile, updateMyProfile, uploadProfileMedia } from '../api';
import type { AchievementItem, AuthUser, ExperienceItem, ProfileBundle, ProjectItem, RequestContext, SkillItem, UserProfile } from '../types';

interface ProfileDashboardProps {
  accessToken: string;
  csrfToken: string;
  currentUser: AuthUser;
}

function emptyExperience(): ExperienceItem {
  return { id: crypto.randomUUID(), company: '', role: '', startDate: '', endDate: '', description: '' };
}

function emptySkill(): SkillItem {
  return { id: crypto.randomUUID(), name: '', level: 'Intermediate' };
}

function emptyProject(): ProjectItem {
  return { id: crypto.randomUUID(), title: '', description: '', image: '', link: '' };
}

function emptyAchievement(): AchievementItem {
  return { id: crypto.randomUUID(), title: '', description: '' };
}

export default function ProfileDashboard({ accessToken, csrfToken, currentUser }: ProfileDashboardProps) {
  const context: RequestContext = useMemo(() => ({ accessToken, csrfToken }), [accessToken, csrfToken]);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [draftUser, setDraftUser] = useState(currentUser);
  const [draftProfile, setDraftProfile] = useState<UserProfile | null>(null);
  const [ranking, setRanking] = useState<Array<{ username: string; name: string; score: number }>>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [preview, setPreview] = useState<ProfileBundle | null>(null);
  const [postContent, setPostContent] = useState('');
  const [message, setMessage] = useState('');

  function updateDraftProfile(updater: (current: UserProfile) => UserProfile) {
    setDraftProfile((current) => (current ? updater(current) : current));
  }

  async function refresh() {
    const [profileBundle, rankingData, suggestionsData] = await Promise.all([fetchMyProfile(context), fetchRanking(), fetchSkillRecommendations(context)]);
    setBundle(profileBundle);
    setDraftUser(profileBundle.user);
    setDraftProfile(profileBundle.profile);
    setRanking(rankingData);
    setSuggestions(suggestionsData);
    setPreview(await fetchPublicProfile(profileBundle.user.username, context));
  }

  useEffect(() => {
    void refresh();
  }, [accessToken, csrfToken]);

  if (!bundle || !draftProfile) {
    return <div className="grid gap-4 md:grid-cols-2"><div className="h-64 animate-pulse rounded-[2rem] bg-slate-200/80 dark:bg-slate-800" /><div className="h-64 animate-pulse rounded-[2rem] bg-slate-200/80 dark:bg-slate-800" /></div>;
  }

  async function saveProfile() {
    if (!draftProfile) return;

    const updated = await updateMyProfile({
      name: draftUser.name,
      bio: draftUser.bio,
      location: draftUser.location,
      website: draftUser.website,
      avatar: draftUser.avatar,
      banner: draftUser.banner,
      socialLinks: draftUser.socialLinks,
      availableForWork: draftUser.availableForWork,
      isPrivate: draftUser.isPrivate,
      contactEmail: draftProfile.contactEmail,
      experiences: draftProfile.experiences,
      education: draftProfile.education,
      skills: draftProfile.skills,
      projects: draftProfile.projects,
      certifications: draftProfile.certifications,
      achievements: draftProfile.achievements,
      sectionOrder: draftProfile.sectionOrder
    }, context);
    setBundle(updated);
    setDraftUser(updated.user);
    setDraftProfile(updated.profile);
    setPreview(await fetchPublicProfile(updated.user.username, context));
    setMessage('Perfil guardado.');
  }

  async function handleUpload(kind: 'avatar' | 'banner', file: File | undefined) {
    if (!file) return;
    const result = await uploadProfileMedia(file, context);
    setDraftUser((current) => ({ ...current, [kind]: result.url }));
  }

  async function handleCreatePost() {
    if (!postContent.trim()) return;
    await createPost(postContent, context);
    setPostContent('');
    await refresh();
  }

  async function toggleSection(section: string, direction: -1 | 1) {
    updateDraftProfile((current) => {
      const index = current.sectionOrder.indexOf(section);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= current.sectionOrder.length) {
        return current;
      }

      const copy = [...current.sectionOrder];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return { ...current, sectionOrder: copy };
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 dark:border-slate-800">
          <div className="h-40 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" style={draftUser.banner ? { backgroundImage: `url(${draftUser.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
          <div className="-mt-14 flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-end gap-4">
              <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">{draftUser.avatar ? <img src={draftUser.avatar} alt={draftUser.name} className="h-full w-full object-cover" /> : null}</div>
              <div><h2 className="text-3xl font-semibold">{draftUser.name}</h2><p className="text-slate-500 dark:text-slate-400">@{draftUser.username}</p></div>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="rounded-full bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">Avatar<input className="hidden" type="file" accept="image/*" onChange={(event) => void handleUpload('avatar', event.target.files?.[0])} /></label>
              <label className="rounded-full bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">Banner<input className="hidden" type="file" accept="image/*" onChange={(event) => void handleUpload('banner', event.target.files?.[0])} /></label>
              <button className="rounded-full bg-sky-600 px-4 py-2 text-sm text-white" onClick={() => void saveProfile()}>Guardar perfil</button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" value={draftUser.name} onChange={(event) => setDraftUser((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre completo" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" value={draftProfile.contactEmail} onChange={(event) => updateDraftProfile((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="Email de contacto" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" value={draftUser.location} onChange={(event) => setDraftUser((current) => ({ ...current, location: event.target.value }))} placeholder="Ubicación" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" value={draftUser.website} onChange={(event) => setDraftUser((current) => ({ ...current, website: event.target.value }))} placeholder="Web personal / portfolio" />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700"><input type="checkbox" checked={draftUser.availableForWork} onChange={(event) => setDraftUser((current) => ({ ...current, availableForWork: event.target.checked }))} /> Disponible para trabajar</label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700"><input type="checkbox" checked={draftUser.isPrivate} onChange={(event) => setDraftUser((current) => ({ ...current, isPrivate: event.target.checked }))} /> Perfil privado</label>
        </div>
        <textarea className="min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" value={draftUser.bio} onChange={(event) => setDraftUser((current) => ({ ...current, bio: event.target.value }))} placeholder="Bio profesional" />

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Experiencia</h3><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => updateDraftProfile((current) => ({ ...current, experiences: [...current.experiences, emptyExperience()] }))}>Agregar</button></div>
            {draftProfile.experiences.map((item) => (
              <div key={item.id} className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.company} onChange={(event) => updateDraftProfile((current) => ({ ...current, experiences: current.experiences.map((entry) => entry.id === item.id ? { ...entry, company: event.target.value } : entry) }))} placeholder="Empresa" />
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.role} onChange={(event) => updateDraftProfile((current) => ({ ...current, experiences: current.experiences.map((entry) => entry.id === item.id ? { ...entry, role: event.target.value } : entry) }))} placeholder="Rol" />
                <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.description} onChange={(event) => updateDraftProfile((current) => ({ ...current, experiences: current.experiences.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry) }))} placeholder="Descripción" />
              </div>
            ))}
            <div className="flex justify-between text-sm"><button onClick={() => void toggleSection('experience', -1)}>Subir bloque</button><button onClick={() => void toggleSection('experience', 1)}>Bajar bloque</button></div>
          </div>

          <div className="space-y-3 rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Skills</h3><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => updateDraftProfile((current) => ({ ...current, skills: [...current.skills, emptySkill()] }))}>Agregar</button></div>
            {draftProfile.skills.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 md:grid-cols-[1fr_auto]">
                <input className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.name} onChange={(event) => updateDraftProfile((current) => ({ ...current, skills: current.skills.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry) }))} placeholder="Skill" />
                <select className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.level} onChange={(event) => updateDraftProfile((current) => ({ ...current, skills: current.skills.map((entry) => entry.id === item.id ? { ...entry, level: event.target.value } : entry) }))}><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Expert</option></select>
              </div>
            ))}
            {suggestions.length > 0 ? <div className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">Sugerencias IA: {suggestions.join(', ')}</div> : null}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Proyectos</h3><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => updateDraftProfile((current) => ({ ...current, projects: [...current.projects, emptyProject()] }))}>Agregar</button></div>
            {draftProfile.projects.map((item) => (
              <div key={item.id} className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.title} onChange={(event) => updateDraftProfile((current) => ({ ...current, projects: current.projects.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry) }))} placeholder="Título" />
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.link} onChange={(event) => updateDraftProfile((current) => ({ ...current, projects: current.projects.map((entry) => entry.id === item.id ? { ...entry, link: event.target.value } : entry) }))} placeholder="Link" />
                <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.description} onChange={(event) => updateDraftProfile((current) => ({ ...current, projects: current.projects.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry) }))} placeholder="Descripción" />
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Logros</h3><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => updateDraftProfile((current) => ({ ...current, achievements: [...current.achievements, emptyAchievement()] }))}>Agregar</button></div>
            {draftProfile.achievements.map((item) => (
              <div key={item.id} className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.title} onChange={(event) => updateDraftProfile((current) => ({ ...current, achievements: current.achievements.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry) }))} placeholder="Título" />
                <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={item.description} onChange={(event) => updateDraftProfile((current) => ({ ...current, achievements: current.achievements.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry) }))} placeholder="Descripción" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Actividad reciente</h3><span className="text-sm text-slate-500 dark:text-slate-400">Posts y likes</span></div>
          <div className="mt-4 flex gap-3">
            <textarea className="min-h-24 flex-1 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Comparte una actualización" value={postContent} onChange={(event) => setPostContent(event.target.value)} />
            <button className="rounded-2xl bg-sky-600 px-4 py-3 text-white" onClick={() => void handleCreatePost()}>Publicar</button>
          </div>
          <div className="mt-4 space-y-3">
            {bundle.posts.map((post) => (
              <article key={post.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                <p>{post.content}</p>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400"><span>{new Date(post.createdAt).toLocaleString()}</span><button onClick={async () => { await toggleLike(post.id, context); await refresh(); }}>Likes {post.likes.length}</button></div>
              </article>
            ))}
          </div>
        </div>

        {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      </section>

      <aside className="space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Vista visitante</h2><div className="flex gap-2"><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => window.print()}>Exportar CV</button><button className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" onClick={() => navigator.clipboard.writeText(window.location.href)}>Compartir</button></div></div>
          {preview ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-cyan-400 p-6 text-white">
                <p className="text-sm uppercase tracking-[0.25em]">Public profile</p>
                <h3 className="mt-3 text-3xl font-semibold">{preview.user.name}</h3>
                <p className="mt-2 text-white/80">@{preview.user.username}</p>
                <p className="mt-4 text-white/90">{preview.user.bio || 'Sin bio todavía.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm"><div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800"><strong className="block text-lg">{preview.followerCount}</strong>Followers</div><div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800"><strong className="block text-lg">{preview.followingCount}</strong>Following</div><div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800"><strong className="block text-lg">{preview.posts.length}</strong>Posts</div></div>
              {preview.user.username !== currentUser.username ? <><button className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700" onClick={async () => { await followProfile(preview.user.username, context); await refresh(); }}>Follow</button><button className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700" onClick={async () => { await unfollowProfile(preview.user.username, context); await refresh(); }}>Unfollow</button></> : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="text-2xl font-semibold">Ranking de perfiles</h2>
          <div className="mt-4 space-y-3">{ranking.map((item, index) => <div key={item.username} className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800"><span>{index + 1}. {item.name}</span><strong>{item.score}</strong></div>)}</div>
        </section>
      </aside>
    </div>
  );
}