import { useEffect, useMemo, useState } from 'react';

import { fetchCsrfToken, fetchMe, logoutUser, refreshSession } from './api';
import AuthPortal from './components/AuthPortal';
import ProfileDashboard from './components/ProfileDashboard';
import SecurityCenter from './components/SecurityCenter';
import WorkflowStudio from './components/WorkflowStudio';
import type { AuthSessionResponse, AuthUser, RequestContext } from './types';

type AppTab = 'automation' | 'profile' | 'security';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AppTab>('automation');

  const requestContext: RequestContext = useMemo(() => ({ accessToken, csrfToken }), [accessToken, csrfToken]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const csrf = await fetchCsrfToken();
        setCsrfToken(csrf.csrfToken);
        const session = await refreshSession();
        setAccessToken(session.accessToken);
        setUser(session.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  async function hydrateMe(nextAccessToken: string) {
    const me = await fetchMe({ accessToken: nextAccessToken, csrfToken });
    setAccessToken(nextAccessToken);
    setUser(me.user);
  }

  function handleAuthenticated(session: AuthSessionResponse) {
    void hydrateMe(session.accessToken);
  }

  async function handleLogout() {
    await logoutUser(requestContext);
    setAccessToken('');
    setUser(null);
    setTab('automation');
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando plataforma…</div>;
  }

  if (!user) {
    return <AuthPortal csrfToken={csrfToken} onAuthenticated={handleAuthenticated} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((current) => !current)} />;
  }

  return (
    <div className={darkMode ? 'min-h-screen bg-slate-950 text-slate-50' : 'min-h-screen bg-[#f7f1e8] text-slate-900'}>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-500">Mini n8n SaaS</p>
            <h1 className="text-2xl font-semibold">{user.name}</h1>
            {!user.verified ? <p className="text-sm text-amber-600 dark:text-amber-300">Tu cuenta todavía no está verificada.</p> : null}
          </div>
          <nav className="flex flex-wrap gap-2">
            {[
              ['automation', 'Automation'],
              ['profile', 'Profile'],
              ['security', 'Security']
            ].map(([value, label]) => (
              <button key={value} onClick={() => setTab(value as AppTab)} className={`rounded-full px-4 py-2 text-sm ${tab === value ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" onClick={() => setDarkMode((current) => !current)}>{darkMode ? 'Light' : 'Dark'}</button>
            <button className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-950" onClick={() => void handleLogout()}>Salir</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {tab === 'automation' ? <WorkflowStudio accessToken={accessToken} csrfToken={csrfToken} /> : null}
        {tab === 'profile' ? <ProfileDashboard accessToken={accessToken} csrfToken={csrfToken} currentUser={user} /> : null}
        {tab === 'security' ? <SecurityCenter accessToken={accessToken} csrfToken={csrfToken} /> : null}
      </main>
    </div>
  );
}