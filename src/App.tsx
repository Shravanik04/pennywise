import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, ChevronDown, ChevronRight, LoaderCircle, Plus, Search, Sparkles, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import ExpenseManager from './components/ExpenseManager'
import BudgetManager from './components/BudgetManager'
import Insights from './components/Insights'
import AskPenny from './components/AskPenny'
import AuthPanel from './components/AuthPanel'
import { cloudConfiguration, deleteCloudExpense, getSupabaseClient, loadCloudBudgets, loadCloudExpenses, saveCloudBudgets, saveCloudExpense, subscribeToCloudData } from './cloudExpenseStore'
import { deleteExpense, deleteLocalReceipt, loadBudgets, loadExpenses, loadRecurringDecisions, openLocalReceipt, openReceipt, saveBudgets, saveExpense, saveLocalReceipt, saveRecurringDecision, subscribeToStorageChanges, type ExpenseRecord, type MonthlyBudget, type RecurringDecision, type RecurringDecisions } from './expenseStore'

function App() {
  const configuration = cloudConfiguration()
  const authConfigurationMessage = configuration.mode === 'configured' ? '' : configuration.message
  const cloudMode = configuration.mode === 'configured'
  const [active, setActive] = useState('Dashboard')
  const [toast, setToast] = useState('')
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
  const authGeneration = useRef(0)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }, [])

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

  const pageTitle = active === 'Dashboard' ? 'Your money, at a glance' : active
  const subtitle = active === 'Dashboard' ? 'Here’s how this month is shaping up.' : active === 'Expenses' ? 'Every receipt, sorted and easy to find.' : `A clearer picture of your money, all in one place.`
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const accountLabel = cloudMode ? user?.email ?? 'Sign in' : 'This browser'

  return <div className="app-shell">
    <Sidebar active={active} onNavigate={setActive} accountLabel={accountLabel} accountDetail={cloudMode ? 'Supabase account' : 'Browser-only data'}/>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">Your space <ChevronRight size={13}/> <span>{active}</span></div><div className="top-actions"><button className="icon-button search-button" aria-label="Search expenses" onClick={() => { setActive('Expenses'); window.setTimeout(() => document.getElementById('expense-search')?.focus(), 0) }}><Search size={18}/></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up!')}><Bell size={18}/><i/></button><div className="top-divider"/><button className="top-profile" onClick={() => cloudMode ? setActive('Settings') : notify('Your data is stored in this browser only.')}><span className="profile-avatar small-avatar">{cloudMode && user?.email ? user.email[0].toUpperCase() : 'P'}</span><span className="account-label">{accountLabel}</span><ChevronDown size={14}/></button></div></header>
      <div className="page-inner">
        <section className="welcome-row"><div><div className="eyebrow">{dateLabel.toUpperCase()} <span className="sun">☀</span></div><h1>{pageTitle}<span className="heading-period">.</span></h1><p className="page-subtitle">{subtitle}</p></div><div className="welcome-actions">{active === 'Dashboard' && <button className="period-button" aria-label="Current calendar month"><CalendarDays size={16}/> This month <ChevronDown size={14}/></button>}{(active === 'Dashboard' || active === 'Expenses') && <button className="primary-button" onClick={() => setActive('Expenses')}><Plus size={17}/> Add expense</button>}</div></section>
        {configuration.mode !== 'configured' && <div className="storage-notice" role="status">{configuration.message}</div>}
        {cloudMode && user && <div className={`storage-notice ${cloudVerified && realtimeReady ? 'storage-connected' : ''}`} role="status">{cloudVerified && realtimeReady ? 'Supabase database and live expense and budget updates are connected for your account.' : cloudVerified && realtimeError ? `Database is connected, but live updates failed: ${realtimeError}` : cloudVerified ? 'Database access is verified. Connecting live expense and budget updates…' : 'Supabase connection is not yet verified; account data will appear only after a successful sign-in and database check.'} Receipt files stay on this device.</div>}
        {(loadError || authError) && <div className="app-load-error" role="alert"><span>{loadError || authError}</span>{loadError && <button className="secondary-button" onClick={() => void refresh()}>Retry</button>}</div>}
        {cloudMode && (!user || (!loading && !cloudVerified)) ? <AuthPanel user={user} authConfigured={cloudMode} configurationMessage={authConfigurationMessage} recoveryPending={recoveryPending} onRecoveryComplete={() => setRecoveryPending(false)} onSignedOut={() => { setUser(null); setRecords([]); setBudgets([]); setCloudVerified(false) }}/> : loading ? <div className="app-loading" role="status"><LoaderCircle size={22} className="spin"/><span>{cloudMode ? 'Checking your account and saved expenses…' : 'Loading your saved expenses and budgets…'}</span></div> : <>
          {active === 'Dashboard' && <Dashboard expenses={records} budgets={budgets} onOpenExpenses={() => setActive('Expenses')} onOpenBudgets={() => setActive('Budgets')}/>}
          {active === 'Expenses' && <ExpenseManager expenses={records} cloudMode={cloudMode} onSave={persistExpense} onDelete={removeExpense} onOpenFile={showReceipt} onNotify={notify}/>}
          {active === 'Budgets' && <BudgetManager expenses={records} budgets={budgets} onSave={persistBudgets} onNotify={notify}/>}
          {active === 'Insights' && <Insights expenses={records} recurringDecisions={recurringDecisions} onRecurringDecision={handleRecurringDecision}/>}
          {active === 'Ask Penny' && <AskPenny expenses={records}/>}
          {active === 'Settings' && <AuthPanel user={cloudMode ? user : null} authConfigured={cloudMode} configurationMessage={authConfigurationMessage} recoveryPending={recoveryPending} onRecoveryComplete={() => setRecoveryPending(false)} onSignedOut={() => { setUser(null); setRecords([]); setBudgets([]); setCloudVerified(false) }}/>}
          {active !== 'Dashboard' && active !== 'Expenses' && active !== 'Budgets' && active !== 'Insights' && active !== 'Ask Penny' && active !== 'Settings' && <section className="panel empty-page"><span className="ask-sparkle"><Sparkles size={22}/></span><h2>{active}</h2><p>Help resources are not available in this app yet.</p><button className="text-link" onClick={() => setActive('Dashboard')}>Back to dashboard</button></section>}
        </>}
        <footer className="page-footer"><span>© {new Date().getFullYear()} Pennywise</span><span>Made for a little more peace of mind <span className="footer-heart">♥</span></span></footer>
      </div>
    </main>
    {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>
}

export default App
