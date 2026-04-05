import { useMemo, useState } from 'react';

import { fetchOAuth, loginUser, loginWithMagicToken, registerUser, requestMagicLink, requestPasswordReset, resetPassword, verifyEmailToken } from '../api';
import type { AuthSessionResponse, RequestContext } from '../types';

interface AuthPortalProps {
  csrfToken: string;
  onAuthenticated: (session: AuthSessionResponse) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

type Tab = 'login' | 'register' | 'recover' | 'magic' | 'verify';

function getRegisterIssues(register: {
  name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}) {
  const issues: string[] = [];

  if (register.name.trim().length < 2) {
    issues.push('El nombre debe tener al menos 2 caracteres.');
  }

  if (!/.+@.+\..+/.test(register.email)) {
    issues.push('El email no es valido.');
  }

  if (!/^[a-zA-Z0-9_.-]{3,}$/.test(register.username)) {
    issues.push('El username debe tener 3+ caracteres y solo usar letras, numeros, guion, punto o guion bajo.');
  }

  if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(register.password)) {
    issues.push('La password debe tener 8+ caracteres, una mayuscula y un numero.');
  }

  if (!(register.password.length > 0 && register.password === register.confirmPassword)) {
    issues.push('La confirmacion de password no coincide.');
  }

  return issues;
}

export default function AuthPortal({ csrfToken, onAuthenticated, darkMode, onToggleDarkMode }: AuthPortalProps) {
  const requestContext: RequestContext = useMemo(() => ({ csrfToken }), [csrfToken]);
  const [tab, setTab] = useState<Tab>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [login, setLogin] = useState({ identifier: '', password: '', rememberMe: true, twoFactorCode: '' });
  const [register, setRegister] = useState({ name: '', email: '', username: '', password: '', confirmPassword: '' });
  const [recover, setRecover] = useState({ email: '', token: '', password: '' });
  const [magic, setMagic] = useState({ email: '', token: '', rememberMe: true });
  const [verifyToken, setVerifyToken] = useState('');
  const registerIssues = getRegisterIssues(register);
  const registerValidation = {
    name: register.name.trim().length >= 2,
    email: /.+@.+\..+/.test(register.email),
    username: /^[a-zA-Z0-9_.-]{3,}$/.test(register.username),
    password: /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(register.password),
    confirmPassword: register.password.length > 0 && register.password === register.confirmPassword
  };

  async function handleOAuth(provider: 'google' | 'github') {
    try {
      const response = await fetchOAuth(provider);
      setNotice(response.message);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar OAuth.');
    }
  }

  async function handleLogin() {
    try {
      const session = await loginUser(login, requestContext);
      onAuthenticated(session);
      setError('');
      setNotice(session.requiresEmailVerification ? 'Tu cuenta necesita verificación de email.' : 'Bienvenido de nuevo.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.';
      setRequiresTwoFactor(message.toLowerCase().includes('2fa'));
      setError(message);
    }
  }

  async function handleRegister() {
    if (!Object.values(registerValidation).every(Boolean)) {
      setError(registerIssues[0] ?? 'Corrige los campos marcados antes de continuar.');
      return;
    }

    try {
      const response = await registerUser(register, requestContext);
      setNotice(response.verificationPreviewToken ? `Cuenta creada. Token de verificación dev: ${response.verificationPreviewToken}` : 'Cuenta creada. Revisa tu email para verificarla.');
      setError('');
      setTab('verify');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear la cuenta.');
    }
  }

  async function handleRequestPasswordReset() {
    try {
      const response = await requestPasswordReset(recover.email, requestContext);
      setNotice(response.resetPreviewToken ? `Token dev: ${response.resetPreviewToken}` : 'Te enviamos instrucciones si el email existe.');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar el reset.');
    }
  }

  async function handleResetPassword() {
    try {
      await resetPassword({ token: recover.token, password: recover.password }, requestContext);
      setNotice('Contraseña actualizada. Ya puedes iniciar sesión.');
      setError('');
      setTab('login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo resetear la contraseña.');
    }
  }

  async function handleRequestMagicLink() {
    try {
      const response = await requestMagicLink(magic.email, requestContext);
      setNotice(response.magicLinkPreviewToken ? `Magic token dev: ${response.magicLinkPreviewToken}` : 'Te enviamos el magic link si el email existe.');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo generar el magic link.');
    }
  }

  async function handleMagicLogin() {
    try {
      const session = await loginWithMagicToken(magic.token, magic.rememberMe, requestContext);
      onAuthenticated(session);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo entrar con magic link.');
    }
  }

  async function handleVerifyEmail() {
    try {
      await verifyEmailToken(verifyToken, requestContext);
      setNotice('Email verificado. Ya puedes iniciar sesión.');
      setError('');
      setTab('login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo verificar el email.');
    }
  }

  return (
    <div className={darkMode ? 'min-h-screen bg-slate-950 text-slate-50' : 'min-h-screen bg-slate-50 text-slate-900'}>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-10 px-6 py-10 lg:flex-row lg:items-center">
        <section className="flex-1 space-y-6">
          <div className="inline-flex rounded-full border border-slate-300/60 bg-white/60 px-4 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            Si no tienes cuenta, primero crea una para entrar, editar tu perfil y ejecutar automatizaciones.
          </div>
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.3em] text-sky-500">SaaS Identity Layer</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-tight">Autenticación profesional, perfiles tipo producto real y automatización en una sola plataforma.</h1>
            <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300">Registro seguro, sesiones activas, magic link, 2FA, perfiles públicos/privados, analytics y un builder de automatización protegido.</p>
          </div>
        </section>

        <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-2xl shadow-slate-200/50 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/30">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-sky-500">Cuenta</p>
              <h2 className="text-2xl font-semibold">Accede o crea tu espacio</h2>
            </div>
            <button onClick={onToggleDarkMode} className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">{darkMode ? 'Light' : 'Dark'} mode</button>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {[
              ['login', 'Login'],
              ['register', 'Registro'],
              ['recover', 'Reset'],
              ['magic', 'Magic Link'],
              ['verify', 'Verificar']
            ].map(([value, label]) => (
              <button key={value} onClick={() => setTab(value as Tab)} className={`rounded-full px-4 py-2 text-sm ${tab === value ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{label}</button>
            ))}
          </div>

          <div className="space-y-4">
            {tab === 'login' ? (
              <>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Email o username" value={login.identifier} onChange={(event) => setLogin((current) => ({ ...current, identifier: event.target.value }))} />
                <div className="relative">
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-28 dark:border-slate-700 dark:bg-slate-950" type={showPassword ? 'text' : 'password'} placeholder="Password" value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
                </div>
                {requiresTwoFactor ? <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Código 2FA" value={login.twoFactorCode} onChange={(event) => setLogin((current) => ({ ...current, twoFactorCode: event.target.value }))} /> : null}
                <label className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={login.rememberMe} onChange={(event) => setLogin((current) => ({ ...current, rememberMe: event.target.checked }))} /> Remember me</label>
                <button className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white" onClick={() => void handleLogin()}>Entrar</button>
              </>
            ) : null}

            {tab === 'register' ? (
              <>
                <input className={`w-full rounded-2xl border px-4 py-3 ${registerValidation.name ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950'}`} placeholder="Nombre completo" value={register.name} onChange={(event) => setRegister((current) => ({ ...current, name: event.target.value }))} />
                <input className={`w-full rounded-2xl border px-4 py-3 ${registerValidation.email ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950'}`} placeholder="Email" value={register.email} onChange={(event) => setRegister((current) => ({ ...current, email: event.target.value }))} />
                <input className={`w-full rounded-2xl border px-4 py-3 ${registerValidation.username ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950'}`} placeholder="Username único" value={register.username} onChange={(event) => setRegister((current) => ({ ...current, username: event.target.value }))} />
                <input className={`w-full rounded-2xl border px-4 py-3 ${registerValidation.password ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950'}`} type={showPassword ? 'text' : 'password'} placeholder="Password" value={register.password} onChange={(event) => setRegister((current) => ({ ...current, password: event.target.value }))} />
                <input className={`w-full rounded-2xl border px-4 py-3 ${registerValidation.confirmPassword ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-950'}`} type={showPassword ? 'text' : 'password'} placeholder="Confirmar password" value={register.confirmPassword} onChange={(event) => setRegister((current) => ({ ...current, confirmPassword: event.target.value }))} />
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <p className="font-medium">Requisitos para crear la cuenta</p>
                  <ul className="mt-2 list-disc pl-5">
                    <li className={registerValidation.name ? 'text-emerald-600 dark:text-emerald-300' : ''}>Nombre con al menos 2 caracteres</li>
                    <li className={registerValidation.email ? 'text-emerald-600 dark:text-emerald-300' : ''}>Email valido</li>
                    <li className={registerValidation.username ? 'text-emerald-600 dark:text-emerald-300' : ''}>Username de 3+ caracteres sin espacios</li>
                    <li className={registerValidation.password ? 'text-emerald-600 dark:text-emerald-300' : ''}>Password de 8+ caracteres con una mayuscula y un numero</li>
                    <li className={registerValidation.confirmPassword ? 'text-emerald-600 dark:text-emerald-300' : ''}>Confirmacion igual a la password</li>
                  </ul>
                </div>
                <button className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white" onClick={() => void handleRegister()}>Crear cuenta</button>
              </>
            ) : null}

            {tab === 'recover' ? (
              <>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Email" value={recover.email} onChange={(event) => setRecover((current) => ({ ...current, email: event.target.value }))} />
                <button className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white dark:bg-slate-100 dark:text-slate-950" onClick={() => void handleRequestPasswordReset()}>Enviar reset</button>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Token reset" value={recover.token} onChange={(event) => setRecover((current) => ({ ...current, token: event.target.value }))} />
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" type={showPassword ? 'text' : 'password'} placeholder="Nueva password" value={recover.password} onChange={(event) => setRecover((current) => ({ ...current, password: event.target.value }))} />
                <button className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white" onClick={() => void handleResetPassword()}>Actualizar password</button>
              </>
            ) : null}

            {tab === 'magic' ? (
              <>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Email" value={magic.email} onChange={(event) => setMagic((current) => ({ ...current, email: event.target.value }))} />
                <button className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white dark:bg-slate-100 dark:text-slate-950" onClick={() => void handleRequestMagicLink()}>Pedir magic link</button>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Token magic link" value={magic.token} onChange={(event) => setMagic((current) => ({ ...current, token: event.target.value }))} />
                <button className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white" onClick={() => void handleMagicLogin()}>Entrar con token</button>
              </>
            ) : null}

            {tab === 'verify' ? (
              <>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Token de verificación" value={verifyToken} onChange={(event) => setVerifyToken(event.target.value)} />
                <button className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white" onClick={() => void handleVerifyEmail()}>Verificar email</button>
              </>
            ) : null}
          </div>

          <div className="my-6 grid gap-3 md:grid-cols-2">
            <button className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700" onClick={() => void handleOAuth('google')}>Continuar con Google</button>
            <button className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700" onClick={() => void handleOAuth('github')}>Continuar con GitHub</button>
          </div>

          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}
          {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div> : null}
        </section>
      </div>
    </div>
  );
}
