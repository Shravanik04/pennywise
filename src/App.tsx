import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Bell, CalendarDays, ChevronDown, ChevronRight, LoaderCircle, LogOut, Plus, Search, Sparkles, UserRound, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import Sidebar from './components/Sidebar'
import Dashboard, { dashboardRangeLabel, type DashboardRange } from './components/Dashboard'
import ExpenseManager from './components/ExpenseManager'
import BudgetManager from './components/BudgetManager'
import Insights from './components/Insights'
import AskPenny from './components/AskPenny'
import AuthPanel from './components/AuthPanel'
import SettingsPage from './components/SettingsPage'
import HelpSupport from './components/HelpSupport'
import { cloudConfiguration, deleteCloudExpense, getSupabaseClient, loadCloudBudgets, loadCloudExpenses, saveCloudBudgets, saveCloudExpense, subscribeToCloudData } from './cloudExpenseStore'
import { clearLocalBrowserData, DEFAULT_PREFERENCES, deleteExpense, deleteLocalReceipt, loadBudgets, loadExpenses, loadPreferences, loadRecurringDecisions, openLocalReceipt, openReceipt, saveBudgets, saveExpense, saveLocalReceipt, savePreferences, saveRecurringDecision, subscribeToStorageChanges, type AppPreferences, type ExpenseRecord, type MonthlyBudget, type RecurringDecision, type RecurringDecisions } from './expenseStore'
import { formatDate } from './finance'

function displayNameFor(user: User | null) {
  if (!user) return ''
  const metadata = user.user_metadata
  for (const candidate of [metadata.full_name, metadata.name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const nameParts = [metadata.given_name, metadata.family_name].filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
  return nameParts.join(' ') || 'Pennywise account'
}

function providerFor(user: User) {
  const provider = user.app_metadata.provider
  if (typeof provider === 'string' && provider.trim()) {
    return provider === 'email' ? 'Email / password' : provider[0].toUpperCase() + provider.slice(1)
  }
  const providers = [...new Set(user.identities?.map((identity) => identity.provider).filter((item) => item.length > 0) ?? [])]
  return providers.length ? providers.map((item) => item[0].toUpperCase() + item.slice(1)).join(', ') : 'Signed-in account'
}

function App() {
  const configuration = cloudConfiguration()
  const authConfigurationMessage = configuration.mode === 'configured' ? '' : configuration.message
  const cloudMode = configuration.mode === 'configured'
  const [active, setActive] = useState('Dashboard')
  const [toast, setToast] = useState('')
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [dateFormatError, setDateFormatError] = useState('')
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>({ type: 'this-month' })
  const [monthDraft, setMonthDraft] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [yearDraft, setYearDraft] = useState(() => String(new Date().getFullYear()))
  const [customRangeDraft, setCustomRangeDraft] = useState({ from: '', to: '' })
  const [customRangeEditorOpen, setCustomRangeEditorOpen] = useState(false)
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const [records, setRecords] = useState<ExpenseRecord[]>([])
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([])
  const [recurringDecisions, setRecurringDecisions] = useState<RecurringDecisions>({})
  const [user, setUser] = useState<User | null>(null)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const [authReady, setAuthReady] = useState(!cloudMode)
  const [cloudVerified, setCloudVerified] = useState(false)
  const [realtimeReady, setRealtimeReady] = useState(false)
  const [realtimeError, setRealtimeError] = useState('')
  const [loading, setLoading] = useState(cloudMode)
  const [loadError, setLoadError] = useState('')
  const [authError, setAuthError] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const authGeneration = useRef(0)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const accountSettingsRef = useRef<HTMLButtonElement>(null)
  const rangeTriggerRef = useRef<HTMLButtonElement>(null)
  const rangeMenuRef = useRef<HTMLDivElement>(null)
  const selectedRangeRef = useRef<HTMLButtonElement>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => {
    let active = true
    void loadPreferences().then((saved) => {
      if (!active) return
      setPreferences(saved)
      setPreferencesLoaded(true)
      setDateFormatError('')
    }).catch((error: unknown) => {
      if (!active) return
      setDateFormatError(error instanceof Error ? error.message : 'Could not load Pennywise preferences.')
      setPreferencesLoaded(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!rangeMenuOpen) return
    selectedRangeRef.current?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rangeMenuRef.current?.contains(event.target)) setRangeMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setRangeMenuOpen(false)
      rangeTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [rangeMenuOpen])

  useEffect(() => {
    if (!cloudMode) { setAuthReady(true); return }
    const supabase = getSupabaseClient()
    if (!supabase) { setAuthReady(true); return }
    let active = true
    const initialGeneration = authGeneration.current
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      authGeneration.current += 1
      setUser(session?.user ?? null)
      setAccountOpen(false)
      setRecoveryPending(event === 'PASSWORD_RECOVERY')
      setRecords([])
      setBudgets([])
      setLoading(Boolean(session?.user))
      setCloudVerified(false)
      setRealtimeReady(false)
      setRealtimeError('')
      setAuthError('')
      setAuthReady(true)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      if (active && authGeneration.current === initialGeneration) {
        setUser(data.session?.user ?? null)
        setAuthError('')
        setAuthReady(true)
      }
    }).catch((error: unknown) => {
      if (!active) return
      setAuthError(error instanceof Error ? `Could not check Supabase authentication: ${error.message}` : 'Could not check Supabase authentication.')
      setAuthReady(true)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [cloudMode])

  useEffect(() => {
    if (!accountOpen) return
    accountSettingsRef.current?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAccountOpen(false)
      accountTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountOpen])

  const refresh = useCallback(async (showLoading = true) => {
    if (!authReady) return
    const generation = authGeneration.current
    if (showLoading) setLoading(true)
    setLoadError('')
    try {
      const owner = cloudMode ? user?.id ?? 'signed-out' : 'local'
      if (cloudMode) await loadExpenses()
      const [expenses, savedBudgets, decisions] = await Promise.all([
        cloudMode ? user ? loadCloudExpenses(user.id) : Promise.resolve([]) : loadExpenses(),
        cloudMode ? user ? loadCloudBudgets(user.id) : Promise.resolve([]) : loadBudgets(owner),
        loadRecurringDecisions(owner),
      ])
      if (generation !== authGeneration.current) return
      setRecords(expenses)
      setBudgets(savedBudgets)
      setRecurringDecisions(decisions)
      setCloudVerified(cloudMode && Boolean(user))
    } catch (error) {
      if (generation !== authGeneration.current) return
      setLoadError(error instanceof Error ? error.message : 'Pennywise could not load browser storage.')
      setCloudVerified(false)
      if (cloudMode) setRecords([])
    } finally { if (generation === authGeneration.current) setLoading(false) }
  }, [authReady, cloudMode, user])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => subscribeToStorageChanges(() => { void refresh(false) }), [refresh])
  useEffect(() => {
    if (!cloudMode || !user || !cloudVerified) { setRealtimeReady(false); setRealtimeError(''); return }
    const generation = authGeneration.current
    return subscribeToCloudData(user.id, () => {
      void Promise.all([loadCloudExpenses(user.id), loadCloudBudgets(user.id)]).then(([expenses, savedBudgets]) => {
        if (generation !== authGeneration.current) return
        setRecords(expenses)
        setBudgets(savedBudgets)
      }).catch((error: unknown) => {
        if (generation !== authGeneration.current) return
        setLoadError(error instanceof Error ? `Could not refresh your account data: ${error.message}` : 'Could not refresh your account data.')
        setRealtimeReady(false)
      })
    }, (connected, detail) => { setRealtimeReady(connected); setRealtimeError(detail ?? '') })
  }, [cloudMode, user, cloudVerified])

  const persistExpense = async (expense: ExpenseRecord, file?: File) => {
    if (cloudMode) {
      if (!user) throw new Error('Sign in before saving cloud expenses.')
      await saveCloudExpense(expense, user.id)
      if (file) await saveLocalReceipt(expense.id, user.id, file)
    } else await saveExpense(expense, file)
    setRecords((current) => [expense, ...current.filter((item) => item.id !== expense.id)].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt))
  }
  const removeExpense = async (id: string) => {
    if (cloudMode) {
      if (!user) throw new Error('Sign in before deleting cloud expenses.')
      await deleteCloudExpense(id, user.id)
      setRecords((current) => current.filter((item) => item.id !== id))
      try { await deleteLocalReceipt(id, user.id) }
      catch (error) { notify(error instanceof Error ? `Expense deleted, but its local receipt could not be removed: ${error.message}` : 'Expense deleted, but the local receipt could not be removed.') }
      return
    } else await deleteExpense(id)
    setRecords((current) => current.filter((item) => item.id !== id))
  }
  const persistBudgets = async (updated: MonthlyBudget[]) => {
    if (cloudMode) {
      if (!user) throw new Error('Sign in before saving account budgets.')
      await saveCloudBudgets(updated, user.id)
    } else await saveBudgets(updated, 'local')
    setBudgets(updated)
  }
  const handleRecurringDecision = async (key: string, decision: RecurringDecision) => {
    try {
      await saveRecurringDecision(key, decision, cloudMode ? user?.id ?? 'signed-out' : 'local')
      setRecurringDecisions((current) => ({ ...current, [key]: decision }))
      notify(decision === 'confirmed' ? 'Recurring payment confirmed.' : 'Suggestion dismissed.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this suggestion.')
    }
  }
  const signOut = async () => {
    setAccountOpen(false)
    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error('Supabase authentication is not configured.')
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setRecords([])
      setBudgets([])
      setCloudVerified(false)
      setRealtimeReady(false)
      setRealtimeError('')
    } catch (error) {
      notify(error instanceof Error ? `Could not sign out: ${error.message}` : 'Could not sign out.')
    }
  }
  const updatePreferences = async (updated: AppPreferences) => {
    await savePreferences(updated)
    setPreferences(updated)
    setDateFormatError('')
  }
  const clearBrowserData = async () => {
    await clearLocalBrowserData()
    setPreferences(DEFAULT_PREFERENCES)
    setDateFormatError('')
    if (!cloudMode) {
      setRecords([])
      setBudgets([])
      setRecurringDecisions({})
    }
  }
  const handleRangeMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'radio') return
    const options = [...(rangeMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])]
    if (!options.length) return
    event.preventDefault()
    const currentIndex = options.findIndex((option) => option === document.activeElement)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[nextIndex].click()
  }
  const selectDashboardRange = (range: DashboardRange) => {
    setDashboardRange(range)
    setRangeMenuOpen(false)
    rangeTriggerRef.current?.focus()
  }
  const applyCustomRange = () => {
    const { from, to } = customRangeDraft
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return
    setCustomRangeEditorOpen(false)
    selectDashboardRange({ type: 'custom', from, to })
  }
  const showReceipt = async (id: string) => {
    const record = cloudMode && user ? await openLocalReceipt(id, user.id) : await openReceipt(id)
    if (!record?.receiptFile) { notify('No receipt file is attached on this device.'); return }
    const url = URL.createObjectURL(record.receiptFile)
    const download = window.document.createElement('a')
    download.href = url
    download.download = records.find((expense) => expense.id === id)?.receiptName ?? 'receipt'
    download.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const pageTitle = active === 'Dashboard' ? 'Your money, at a glance' : active === 'Account' ? 'Account security' : active
  const subtitle = active === 'Dashboard' ? 'Here’s how this month is shaping up.' : active === 'Expenses' ? 'Every receipt, sorted and easy to find.' : `A clearer picture of your money, all in one place.`
  const dateLabel = formatDate(new Date(), preferences.dateFormat, 'long')
  const selectedRangeLabel = dashboardRangeLabel(dashboardRange)
  const accountLabel = cloudMode ? user?.email ?? (authReady ? 'Sign in' : 'Checking…') : 'This browser'
  const displayName = displayNameFor(user)
  const accountHeading = user ? displayName : cloudMode ? (authReady ? 'Signed out' : 'Checking session…') : 'This browser'

  return <div className="app-shell">
    <Sidebar active={active} onNavigate={setActive} accountLabel={accountLabel} accountDetail={cloudMode ? 'Supabase account' : 'Browser-only data'}/>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">Your space <ChevronRight size={13}/> <span>{active}</span></div><div className="top-actions"><button className="icon-button search-button" aria-label="Search expenses" onClick={() => { setActive('Expenses'); window.setTimeout(() => document.getElementById('expense-search')?.focus(), 0) }}><Search size={18}/></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up!')}><Bell size={18}/><i/></button><div className="top-divider"/><div className="top-profile-wrap" ref={accountMenuRef} onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false) }}><button ref={accountTriggerRef} type="button" className="top-profile" aria-haspopup="dialog" aria-expanded={accountOpen} aria-controls="account-dropdown" onClick={() => setAccountOpen((open) => !open)}><span className="profile-avatar small-avatar">{user?.email?.[0]?.toUpperCase() ?? 'P'}</span><span className="account-label">{accountLabel}</span><ChevronDown size={14}/></button>{accountOpen && <div className="account-dropdown" id="account-dropdown" role="dialog" aria-label="Account details" aria-live="polite"><div className="account-dropdown-heading"><span className="profile-avatar"><UserRound size={18}/></span><div><b>{accountHeading}</b><span>{cloudMode && user ? 'Signed-in account' : cloudMode && !authReady ? 'Please wait while your session is checked.' : cloudMode ? 'Sign in to sync your account data.' : 'Your data stays in this browser.'}</span></div></div>{user && <><p className="account-dropdown-email">{user.email ?? 'Email unavailable'}</p><p className="account-dropdown-provider">Account: {providerFor(user)}</p></>}<div className="account-dropdown-actions">{cloudMode && <button type="button" onClick={() => { setAccountOpen(false); setActive('Account') }}><UserRound size={17}/><span>Account security</span></button>}<button ref={accountSettingsRef} type="button" onClick={() => { setAccountOpen(false); setActive('Settings') }}><UserRound size={17}/><span>Settings</span></button>{user && <button type="button" onClick={() => void signOut()}><LogOut size={17}/><span>Sign out</span></button>}</div></div>}</div></div></header>
      <div className="page-inner">
        <section className="welcome-row"><div><div className="eyebrow">{dateLabel.toUpperCase()} <span className="sun">☀</span></div><h1>{pageTitle}<span className="heading-period">.</span></h1><p className="page-subtitle">{subtitle}</p></div><div className="welcome-actions">{active === 'Dashboard' && <div className="period-filter-wrap" ref={rangeMenuRef} onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setRangeMenuOpen(false) }}><button ref={rangeTriggerRef} type="button" className="period-button" aria-haspopup="dialog" aria-expanded={rangeMenuOpen} aria-controls="dashboard-range-menu" onClick={() => setRangeMenuOpen((open) => !open)}><CalendarDays size={16}/>{selectedRangeLabel}<ChevronDown size={14}/></button>{rangeMenuOpen && <div className="period-filter-menu" id="dashboard-range-menu" role="dialog" aria-label="Dashboard date range" onKeyDown={handleRangeMenuKeyDown}><div className="range-presets" role="radiogroup" aria-label="Quick date ranges"><button ref={dashboardRange.type !== 'previous-month' ? selectedRangeRef : undefined} type="button" role="radio" aria-checked={dashboardRange.type === 'this-month'} tabIndex={dashboardRange.type === 'previous-month' ? -1 : 0} onClick={() => selectDashboardRange({ type: 'this-month' })}>This month</button><button ref={dashboardRange.type === 'previous-month' ? selectedRangeRef : undefined} type="button" role="radio" aria-checked={dashboardRange.type === 'previous-month'} tabIndex={dashboardRange.type === 'previous-month' ? 0 : -1} onClick={() => selectDashboardRange({ type: 'previous-month' })}>Previous month</button></div><label className="range-field">Specific month and year<input aria-label="Specific month and year" type="month" value={monthDraft} onChange={(event) => { const value = event.currentTarget.value; setMonthDraft(value); if (/^\d{4}-\d{2}$/.test(value)) setDashboardRange({ type: 'month', value }) }}/></label><label className="range-field">Specific year<input aria-label="Specific year" type="number" min="1900" max="9999" step="1" value={yearDraft} onChange={(event) => { const value = event.currentTarget.value; setYearDraft(value); const year = Number(value); if (/^\d{4}$/.test(value) && year >= 1900 && year <= 9999) setDashboardRange({ type: 'year', value: year }) }}/></label><div className="range-custom"><button className="range-custom-toggle" type="button" aria-expanded={customRangeEditorOpen} onClick={() => { if (!customRangeEditorOpen && dashboardRange.type === 'custom') setCustomRangeDraft({ from: dashboardRange.from, to: dashboardRange.to }); setCustomRangeEditorOpen((open) => !open) }}>Custom date range</button>{customRangeEditorOpen && <div className="range-custom-fields"><label className="range-field">Start date<input aria-label="Start date" type="date" value={customRangeDraft.from} onChange={(event) => { const from = event.currentTarget.value; setCustomRangeDraft((current) => ({ ...current, from })) }}/></label><label className="range-field">End date<input aria-label="End date" type="date" value={customRangeDraft.to} onChange={(event) => { const to = event.currentTarget.value; setCustomRangeDraft((current) => ({ ...current, to })) }}/></label><button className="range-apply-button" type="button" disabled={!customRangeDraft.from || !customRangeDraft.to || customRangeDraft.from > customRangeDraft.to} onClick={applyCustomRange}>Apply dates</button>{customRangeDraft.from && customRangeDraft.to && customRangeDraft.from > customRangeDraft.to && <span className="range-validation" role="alert">Start date must be on or before end date.</span>}</div>}</div></div>}</div>}{(active === 'Dashboard' || active === 'Expenses') && <button className="primary-button" onClick={() => setActive('Expenses')}><Plus size={17}/> Add expense</button>}</div></section>
        {configuration.mode !== 'configured' && <div className="storage-notice" role="status">{configuration.message}</div>}
        {cloudMode && user && <div className={`storage-notice ${cloudVerified && realtimeReady ? 'storage-connected' : ''}`} role="status">{cloudVerified && realtimeReady ? 'Supabase database and live expense and budget updates are connected for your account.' : cloudVerified && realtimeError ? `Database is connected, but live updates failed: ${realtimeError}` : cloudVerified ? 'Database access is verified. Connecting live expense and budget updates…' : 'Supabase connection is not yet verified; account data will appear only after a successful sign-in and database check.'} Receipt files stay on this device.</div>}
        {(loadError || authError) && <div className="app-load-error" role="alert"><span>{loadError || authError}</span>{loadError && <button className="secondary-button" onClick={() => void refresh()}>Retry</button>}</div>}
        {active === 'Help & support' ? <HelpSupport cloudMode={cloudMode}/> : active === 'Settings' ? <SettingsPage expenses={records} dateFormat={preferences.dateFormat} cloudMode={cloudMode} expensesReady={!cloudMode || Boolean(user && cloudVerified && !loading)} preferencesLoaded={preferencesLoaded} dateFormatError={dateFormatError} onDateFormatChange={updatePreferences} onClearLocalData={clearBrowserData} onNotify={notify}/> : active === 'Account' ? <AuthPanel user={user} authConfigured={cloudMode} configurationMessage={authConfigurationMessage} recoveryPending={recoveryPending} onRecoveryComplete={() => setRecoveryPending(false)} onSignedOut={() => { setUser(null); setRecords([]); setBudgets([]); setCloudVerified(false) }}/> : cloudMode && (!user || (!loading && !cloudVerified)) ? <AuthPanel user={user} authConfigured={cloudMode} configurationMessage={authConfigurationMessage} recoveryPending={recoveryPending} onRecoveryComplete={() => setRecoveryPending(false)} onSignedOut={() => { setUser(null); setRecords([]); setBudgets([]); setCloudVerified(false) }}/> : loading ? <div className="app-loading" role="status"><LoaderCircle size={22} className="spin"/><span>{cloudMode ? 'Checking your account and saved expenses…' : 'Loading your saved expenses and budgets…'}</span></div> : <>
          {active === 'Dashboard' && <Dashboard expenses={records} budgets={budgets} dateFormat={preferences.dateFormat} range={dashboardRange} onOpenExpenses={() => setActive('Expenses')} onOpenBudgets={() => setActive('Budgets')}/>}
          {active === 'Expenses' && <ExpenseManager expenses={records} cloudMode={cloudMode} dateFormat={preferences.dateFormat} onSave={persistExpense} onDelete={removeExpense} onOpenFile={showReceipt} onNotify={notify}/>}
          {active === 'Budgets' && <BudgetManager expenses={records} budgets={budgets} onSave={persistBudgets} onNotify={notify}/>}
          {active === 'Insights' && <Insights expenses={records} recurringDecisions={recurringDecisions} dateFormat={preferences.dateFormat} onRecurringDecision={handleRecurringDecision}/>}
          {active === 'Ask Penny' && <AskPenny expenses={records} dateFormat={preferences.dateFormat}/>}
          {active !== 'Dashboard' && active !== 'Expenses' && active !== 'Budgets' && active !== 'Insights' && active !== 'Ask Penny' && active !== 'Account' && active !== 'Help & support' && <section className="panel empty-page"><span className="ask-sparkle"><Sparkles size={22}/></span><h2>{active}</h2><p>Help resources are not available in this app yet.</p><button className="text-link" onClick={() => setActive('Dashboard')}>Back to dashboard</button></section>}
        </>}
        <footer className="page-footer"><span>© {new Date().getFullYear()} Pennywise</span><span>Made for a little more peace of mind <span className="footer-heart">♥</span></span></footer>
      </div>
    </main>
    {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>
}

export default App
