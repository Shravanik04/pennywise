import { useMemo, useState } from 'react'
import { AlertCircle, ArrowDownRight, CalendarClock, Check, Info, LoaderCircle, X } from 'lucide-react'
import type { ExpenseRecord, RecurringDecision, RecurringDecisions } from '../expenseStore'
import { currency, detectRecurring, isCurrentMonth, monthCategoryTotals, monthlyHistory } from '../finance'

type Props = { expenses: ExpenseRecord[]; recurringDecisions: RecurringDecisions; onRecurringDecision: (key: string, decision: RecurringDecision) => Promise<void> }
const dateText = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const localMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export default function Insights({ expenses, recurringDecisions, onRecurringDecision }: Props) {
  const now = new Date()
  const month = localMonthKey(now)
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonth = localMonthKey(prevDate)
  const currentTotals = useMemo(() => monthCategoryTotals(expenses, month), [expenses, month])
  const previousTotals = useMemo(() => monthCategoryTotals(expenses, previousMonth), [expenses, previousMonth])
  const currentExpenses = useMemo(() => expenses.filter((expense) => isCurrentMonth(expense.date)), [expenses, month])
  const activeExpenseDays = useMemo(() => new Set(currentExpenses.map((expense) => expense.date)).size, [currentExpenses])
  const previousMonthExpenseCount = useMemo(() => expenses.filter((expense) => expense.date.slice(0, 7) === previousMonth).length, [expenses, previousMonth])
  const comparisonReady = currentExpenses.length > 0 && previousMonthExpenseCount > 0
  const categories = useMemo(() => comparisonReady ? [...new Set([...currentTotals.keys(), ...previousTotals.keys()])].map((category) => ({ category, current: currentTotals.get(category) ?? 0, previous: previousTotals.get(category) ?? 0 })).sort((a, b) => b.current - a.current) : [], [currentTotals, previousTotals, comparisonReady])
  const baselineCount = useMemo(() => expenses.filter((expense) => expense.date.slice(0, 7) !== month).length, [expenses, month])
  const history = useMemo(() => monthlyHistory(expenses), [expenses])
  const total = currentExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const estimateReady = activeExpenseDays >= 3
  const estimate = estimateReady ? Math.round(total / now.getDate() * daysInMonth) : null
  const recurring = useMemo(() => detectRecurring(expenses), [expenses])
  const largePurchases = useMemo(() => {
    const history = expenses.filter((expense) => expense.date.slice(0, 7) !== month)
    if (history.length < 5) return []
    const amounts = history.map((expense) => expense.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    const threshold = median * 2
    return currentExpenses.filter((expense) => expense.amount >= threshold).sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [expenses, currentExpenses, month])
  const confirmed = recurring.filter((item) => recurringDecisions[item.key] === 'confirmed')
  const suggestions = recurring.filter((item) => recurringDecisions[item.key] !== 'confirmed' && recurringDecisions[item.key] !== 'dismissed')
  const decide = async (key: string, decision: RecurringDecision) => {
    setSavingDecision(key)
    setDecisionError('')
    try { await onRecurringDecision(key, decision) }
    catch (error) { setDecisionError(error instanceof Error ? error.message : 'Could not save your choice.') }
    finally { setSavingDecision('') }
  }
  const [savingDecision, setSavingDecision] = useState('')
  const [decisionError, setDecisionError] = useState('')

  return <section className="insights-dashboard">
    <div className="insights-heading"><div><span className="eyebrow">PATTERNS, NOT PROMISES</span><h2>Insights</h2><p>Calculated only from your saved expenses; more history is needed for some patterns.</p></div><span className="data-based-badge"><Info size={14}/> Saved-expense insights</span></div>
    <div className="insight-estimate-grid"><article className="estimate-card"><span>MONTH-END ESTIMATE</span><b>{estimate === null ? '—' : currency(estimate)}</b><p>{estimateReady ? `Based on ${currency(total)} across ${activeExpenseDays} days with recorded expenses this month.` : currentExpenses.length ? `Save expenses on ${3 - activeExpenseDays} more different days this month before a pace-based estimate is shown.` : 'Add expenses on at least 3 different days this month to calculate a pace-based estimate.'}</p><small>This assumes spending continues at the same daily pace.</small></article><article className="estimate-card secondary-estimate"><span>MONTH-OVER-MONTH</span><b>{comparisonReady ? `${categories.length} categories compared` : 'Needs more data'}</b><p>{comparisonReady ? 'Category totals are compared across the current and previous calendar month.' : 'Save expenses in both the current and previous calendar month to compare categories.'}</p><small>These patterns are calculated only from your saved expenses.</small></article></div>
    <div className="insight-analysis-grid"><article className="panel insight-analysis-card"><div className="analysis-heading"><div><h3>Category changes</h3><p>This month compared with last month</p></div><span className="analysis-icon"><ArrowDownRight size={17}/></span></div>{categories.length ? <div className="change-list">{categories.map((item) => { const delta = item.current - item.previous; const percent = item.previous ? delta / item.previous * 100 : null; return <div className="change-row" key={item.category}><div><b>{item.category}</b><small>{currency(item.previous)} last month</small></div><strong>{currency(item.current)}</strong><span className={`change-badge ${delta > 0 ? 'change-up' : 'change-down'}`}>{percent === null ? 'New' : `${delta > 0 ? '+' : ''}${Math.round(percent)}%`}</span></div> })}</div> : <div className="dashboard-empty compact"><span>◈</span><b>No category comparisons yet</b><p>Save expenses across this month and last month to compare categories.</p></div>}</article>
      <article className="panel insight-analysis-card"><div className="analysis-heading"><div><h3>Unusually large purchases</h3><p>Compared with your own recorded spending</p></div><span className="analysis-icon"><AlertCircle size={17}/></span></div>{largePurchases.length ? <div className="change-list">{largePurchases.map((expense) => <div className="large-expense-row" key={expense.id}><span className={`merchant-icon ${expense.tone}`}>{expense.icon}</span><div><b>{expense.merchant}</b><small>{dateText(expense.date)} · your expense history baseline</small></div><strong>{currency(expense.amount)}</strong></div>)}</div> : <div className="dashboard-empty compact"><span>✓</span><b>{currentExpenses.length === 0 ? 'No expenses to compare this month' : baselineCount < 5 ? 'Building your personal baseline' : 'Nothing stands out right now'}</b><p>{currentExpenses.length === 0 ? 'Save expenses this month and from earlier months to compare your activity.' : baselineCount < 5 ? `Save ${5 - baselineCount} more expenses from previous months to establish a comparison baseline.` : 'No expense crossed the data-based unusual-spend threshold.'}</p></div>}</article></div>
    <section className="panel recurring-panel"><div className="analysis-heading"><div><h3>Possible recurring payments</h3><p>Suggestions require at least 3 dates with similar amounts and a regular interval. Nothing is auto-labelled.</p></div><span className="analysis-icon"><CalendarClock size={17}/></span></div>{decisionError && <p className="budget-form-error" role="alert">{decisionError}</p>}{suggestions.length ? <div className="recurring-list">{suggestions.map((suggestion) => <article className="recurring-row" key={suggestion.key}><span className="recurring-symbol"><CalendarClock size={18}/></span><div className="recurring-details"><b>{suggestion.merchant}</b><span>{currency(suggestion.amount)} · likely {suggestion.frequency.toLowerCase()}</span><small>{suggestion.occurrences} similar payments · next expected {dateText(suggestion.nextDate)}</small></div><span className="suggestion-tag">SUGGESTION</span><div className="recurring-actions"><button className="secondary-button" disabled={savingDecision === suggestion.key} onClick={() => void decide(suggestion.key, 'dismissed')} aria-label={`Dismiss recurring suggestion for ${suggestion.merchant}`} aria-busy={savingDecision === suggestion.key}>{savingDecision === suggestion.key ? <LoaderCircle size={14} className="spin"/> : <X size={14}/>} {savingDecision === suggestion.key ? 'Saving…' : 'Dismiss'}</button><button className="primary-button" disabled={savingDecision === suggestion.key} onClick={() => void decide(suggestion.key, 'confirmed')} aria-busy={savingDecision === suggestion.key}>{savingDecision === suggestion.key ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} {savingDecision === suggestion.key ? 'Saving…' : 'Confirm'}</button></div></article>)}</div> : <div className="dashboard-empty compact"><span>◷</span><b>{recurring.some((item) => recurringDecisions[item.key] === 'dismissed') ? 'No active suggestions' : 'No recurring suggestions yet'}</b><p>{recurring.some((item) => recurringDecisions[item.key] === 'dismissed') ? 'Dismissed suggestions stay hidden. They are never re-added automatically.' : 'We need at least three similar payments from the same merchant on a regular cadence. A single receipt is never enough.'}</p></div>}{confirmed.length > 0 && <div className="confirmed-recurring"><b>Confirmed by you</b>{confirmed.map((item) => <span key={item.key}><Check size={13}/>{item.merchant} · {currency(item.amount)} {item.frequency.toLowerCase()}</span>)}</div>}</section>
    <p className="insights-disclaimer">The month-end estimate assumes a steady daily spend. Unusual purchase flags compare against your own saved transaction history. These are informational calculations, not financial advice.</p>
    <div className="sr-only" aria-live="polite">Six-month expense history contains {history.length} calendar periods. Current month total: {currency(total)}.</div>
  </section>
}
