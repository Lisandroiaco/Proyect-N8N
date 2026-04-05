import { useEffect, useState } from 'react';

import { disableTwoFactor, fetchActivity, fetchSessions, revokeSession, setupTwoFactor, verifyTwoFactor } from '../api';
import type { ActivityLog, RequestContext, SessionInfo } from '../types';

interface SecurityCenterProps {
  accessToken: string;
  csrfToken: string;
}

export default function SecurityCenter({ accessToken, csrfToken }: SecurityCenterProps) {
  const context: RequestContext = { accessToken, csrfToken };
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [setupData, setSetupData] = useState<{ otpauthUrl: string; manualCode: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const [sessionData, activityData] = await Promise.all([fetchSessions(context), fetchActivity(context)]);
    setSessions(sessionData);
    setActivity(activityData);
  }

  useEffect(() => {
    void refresh();
  }, [accessToken, csrfToken]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Seguridad</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">2FA + sesiones</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          <button className="rounded-2xl bg-sky-600 px-4 py-3 text-white" onClick={async () => { const data = await setupTwoFactor(context); setSetupData(data); setMessage('Escanea el secreto o usa el código manual.'); }}>Configurar 2FA</button>
          <button className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700" onClick={async () => { await disableTwoFactor(code, context); setMessage('2FA desactivado.'); setCode(''); await refresh(); }}>Desactivar 2FA</button>
        </div>
        {setupData ? <div className="rounded-2xl bg-slate-100 p-4 text-sm dark:bg-slate-800"><p className="font-medium">Código manual</p><pre className="mt-2 overflow-auto">{setupData.manualCode}</pre></div> : null}
        <div className="flex gap-3">
          <input className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Código 2FA" value={code} onChange={(event) => setCode(event.target.value)} />
          <button className="rounded-2xl bg-slate-900 px-4 py-3 text-white dark:bg-slate-100 dark:text-slate-950" onClick={async () => { await verifyTwoFactor(code, context); setMessage('2FA verificado y activado.'); setCode(''); await refresh(); }}>Verificar</button>
        </div>
        {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      </section>

      <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div>
          <h3 className="text-xl font-semibold">Sesiones activas</h3>
          <div className="mt-4 space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3"><div><p className="font-medium">{session.deviceName}</p><p className="text-sm text-slate-500 dark:text-slate-400">{session.userAgent}</p></div><button className="rounded-full bg-rose-100 px-3 py-1 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" onClick={async () => { await revokeSession(session.id, context); await refresh(); }}>Cerrar</button></div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{session.ipAddress} · {new Date(session.lastSeenAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold">Actividad reciente</h3>
          <div className="mt-4 space-y-3">
            {activity.map((entry) => <div key={entry.id} className="rounded-2xl bg-slate-100 p-4 text-sm dark:bg-slate-800"><p className="font-medium">{entry.message}</p><p className="mt-1 text-slate-500 dark:text-slate-400">{entry.type} · {new Date(entry.createdAt).toLocaleString()}</p></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
