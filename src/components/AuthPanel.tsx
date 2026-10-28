import { useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, LockKeyhole } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../cloudExpenseStore'

type Props = {
  user: User | null
  authConfigured: boolean
  configurationMessage: string
  recoveryPending: boolean
  onRecoveryComplete: () => void
  onSignedOut: () => void
}
type AuthScreen = 'login' | 'signup' | 'reset'

export default function AuthPanel({ user, authConfigured, configurationMessage, recoveryPending, onRecoveryComplete, onSignedOut }: Props) {
  const [screen, setScreen] = useState<AuthScreen>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const resetForm = (nextScreen: AuthScreen) => {
    setScreen(nextScreen)
    setPassword('')
    setPasswordConfirmation('')
    setError('')
    setMessage('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!authConfigured) {
      setError(configurationMessage || 'Configure Supabase before using account authentication.')
      return
    }
    if ((recoveryPending || screen === 'signup') && password !== passwordConfirmation) {
      setError(recoveryPending ? 'The new passwords do not match.' : 'The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error('Supabase authentication is not configured.')
      if (recoveryPending) {
        const { error: authError } = await supabase.auth.updateUser({ password })
        if (authError) throw authError
        setPassword('')
        setPasswordConfirmation('')
        setMessage('Your password has been updated.')
        setScreen('login')
        onRecoveryComplete()
      } else if (screen === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password })
        if (authError) throw authError
        if (!data.session) {
          setScreen('login')
          setPassword('')
          setMessage('If registration is enabled, check your email to confirm your account, then log in.')
        } else setMessage('Your account was created and you are logged in.')
      } else if (screen === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        if (authError) throw authError
        setMessage('If an account exists for that email, a password reset link has been sent.')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setError('')
    setBusy(true)
    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error('Supabase authentication is not configured.')
      const { error: authError } = await supabase.auth.signOut()
      if (authError) throw authError
      onSignedOut()
      setMessage('You have logged out.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log out. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const accountScreen = Boolean(user && !recoveryPending && screen === 'login')
  const title = recoveryPending ? 'Choose a new password' : screen === 'signup' ? 'Create your account' : screen === 'reset' ? 'Reset your password' : 'Log in to Pennywise'

  return <section className="panel auth-card">
    <span className="auth-icon"><LockKeyhole size={21}/></span>
    <span className="eyebrow">{user ? 'ACCOUNT SECURITY' : 'PRIVATE ACCOUNT'}</span>
    <h2>{authConfigured ? accountScreen ? 'Your Pennywise account' : title : 'Account sign-in setup needed'}</h2>
    {!authConfigured ? <>
      <p role="alert">{configurationMessage || 'Supabase authentication is not configured. No login or sign-up was attempted.'}</p>
      <ol className="auth-setup-steps">
        <li>Create a Supabase project and enable email/password authentication.</li>
        <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
        <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your Supabase project settings, then restart Vite.</li>
        <li>Allow your app's local and deployed URLs in Supabase Auth redirect settings.</li>
      </ol>
      <p className="auth-message">Authentication is unavailable until valid project configuration is supplied. Your current browser-only data is unchanged.</p>
    </> : accountScreen ? <>
      <p>Logged in as <b>{user?.email}</b>. Your expenses and budgets are loaded from your private account.</p>
      {error && <p className="budget-form-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      <div className="auth-account-actions">
        <button className="secondary-button" disabled={busy} onClick={() => resetForm('reset')}>Reset password</button>
        <button className="secondary-button" disabled={busy} onClick={() => void signOut()}>{busy ? <LoaderCircle size={15} className="spin"/> : null} Log out</button>
      </div>
      <small>Your account data is protected by Supabase row-level security. Receipt files remain on this device.</small>
    </> : <>
      {recoveryPending && <p>Enter a new password for {user?.email ?? 'your account'}.</p>}
      {!recoveryPending && screen !== 'login' && <button className="auth-back" onClick={() => resetForm('login')}><ArrowLeft size={14}/> Back to log in</button>}
      {!recoveryPending && screen === 'login' && <p>Log in to access expenses and budgets saved privately to your account.</p>}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {!recoveryPending && <label>Email
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>}
        {screen !== 'reset' || recoveryPending ? <label>{recoveryPending ? 'New password' : 'Password'}
          <input type="password" autoComplete={recoveryPending || screen === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          {(recoveryPending || screen === 'signup') && <small>Use at least 8 characters.</small>}
        </label> : null}
        {(recoveryPending || screen === 'signup') && <label>{recoveryPending ? 'Confirm new password' : 'Confirm password'}
          <input type="password" autoComplete="new-password" minLength={8} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} />
        </label>}
        {error && <p className="budget-form-error" role="alert">{error}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : null}{recoveryPending ? 'Update password' : screen === 'signup' ? 'Sign up' : screen === 'reset' ? 'Send reset link' : 'Log in'}</button>
      </form>
      {!recoveryPending && screen === 'login' && <div className="auth-links"><button className="auth-toggle" onClick={() => resetForm('reset')}>Forgot password?</button><button className="auth-toggle" onClick={() => resetForm('signup')}>Create an account</button></div>}
      {!recoveryPending && screen === 'signup' && <button className="auth-toggle" onClick={() => resetForm('login')}>Already have an account? Log in</button>}
      {!recoveryPending && screen === 'reset' && <button className="auth-toggle" onClick={() => resetForm('login')}>Return to log in</button>}
      <small>Authentication is handled by Supabase. Pennywise does not store your password.</small>
    </>}
  </section>
}
