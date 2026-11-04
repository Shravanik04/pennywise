import { ArrowUpRight, ReceiptText, TrendingUp } from 'lucide-react'
import type { DateFormat, ExpenseRecord } from '../expenseStore'
import { categoryAllocations, currency, formatDate, monthKey, readableMonth } from '../finance'

export type DashboardRange =
  | { type: 'this-month' }
  | { type: 'previous-month' }
  | { type: 'month'; value: string }
  | { type: 'year'; value: number }
  | { type: 'custom'; from: string; to: string }
type Props = { expenses: ExpenseRecord[]; budgets: Array<{ id: string; category: string; limit: number }>; dateFormat: DateFormat; range: DashboardRange; onOpenExpenses: () => void; onOpenBudgets: () => void }
const categoryColors: Record<string, string> = { 'Food & drink': '#40745b', Groceries: '#b4c9a8', 'Personal Care': '#d8a785', Transport: '#e4b88b', Bills: '#c9bfdf', Shopping: '#b4c9a8', Subscriptions: '#d49a9e', Health: '#8db2a2', Other: '#adb89c' }
type ChartPoint = { key: string; label: string; total: number; count: number }

const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function dashboardRangeLabel(range: DashboardRange) {
  if (range.type === 'this-month') return 'This month'
  if (range.type === 'previous-month') return 'Previous month'
  if (range.type === 'month') {
    const [year, month] = range.value.split('-').map(Number)
    return readableMonth(new Date(year, month - 1, 1))
  }
  if (range.type === 'year') return String(range.value)
  return `${formatDate(range.from)} – ${formatDate(range.to)}`
}

function dashboardRangeBounds(range: DashboardRange, now: Date) {
  if (range.type === 'custom') return { from: range.from, to: range.to }
  if (range.type === 'year') return { from: `${range.value}-01-01`, to: `${range.value}-12-31` }
  if (range.type === 'month') {
    const [year, month] = range.value.split('-').map(Number)
    return { from: `${range.value}-01`, to: localDateKey(new Date(year, month, 0)) }
  }
  const offset = range.type === 'previous-month' ? -1 : 0
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return { from: localDateKey(start), to: localDateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0)) }
}

function budgetAllowanceForPeriod(monthlyLimit: number, from: string, to: string) {
  const [startYear, startMonth, startDay] = from.split('-').map(Number)
  const [endYear, endMonth, endDay] = to.split('-').map(Number)
  let allowance = 0
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDay = year === startYear && month === startMonth ? startDay : 1
    const lastDay = year === endYear && month === endMonth ? endDay : daysInMonth
    allowance += monthlyLimit * (lastDay - firstDay + 1) / daysInMonth
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return allowance
}

function chartHistory(expenses: ExpenseRecord[], range: DashboardRange, from: string, to: string): ChartPoint[] {
  const [startYear, startMonth, startDay] = from.split('-').map(Number)
  const [endYear, endMonth, endDay] = to.split('-').map(Number)
  const dayCount = (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000 + 1
  const monthCount = (endYear - startYear) * 12 + endMonth - startMonth + 1
  const points: ChartPoint[] = []
  const addPoint = (key: string, label: string, matches: (expense: ExpenseRecord) => boolean) => {
    const inPeriod = expenses.filter(matches)
    points.push({ key, label, total: inPeriod.reduce((sum, expense) => sum + expense.amount, 0), count: inPeriod.length })
  }

  if (range.type === 'custom' && dayCount <= 31) {
    for (let date = new Date(startYear, startMonth - 1, startDay); localDateKey(date) <= to; date.setDate(date.getDate() + 1)) {
      const key = localDateKey(date)
      addPoint(key, `${date.getDate()} ${new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date)}`, (expense) => expense.date === key)
    }
    return points
  }
  if (monthCount <= 24) {
    for (let index = 0; index < monthCount; index += 1) {
      const date = new Date(startYear, startMonth - 1 + index, 1)
      const key = monthKey(date)
      addPoint(key, readableMonth(date, true), (expense) => expense.date.slice(0, 7) === key)
    }
    return points
  }
  const yearStep = monthCount > 1200 ? 10 : 1
  const firstYear = yearStep === 10 ? Math.floor(startYear / 10) * 10 : startYear
  for (let year = firstYear; year <= endYear; year += yearStep) {
    const key = String(year)
    const label = yearStep === 10 ? `${year}s` : key
    addPoint(key, label, (expense) => {
      const expenseYear = Number(expense.date.slice(0, 4))
      return expenseYear >= year && expenseYear < year + yearStep
    })
  }
  return points
}

export default function Dashboard({ expenses, budgets, dateFormat, range, onOpenExpenses, onOpenBudgets }: Props) {
  const month = new Date()
  const rangeLabel = dashboardRangeLabel(range)
  const rangeDescription = range.type === 'this-month' ? 'this month' : range.type === 'previous-month' ? 'previous month' : rangeLabel
  const bounds = dashboardRangeBounds(range, month)
  const rangeExpenses = expenses.filter((expense) => expense.date >= bounds.from && expense.date <= bounds.to)
  const total = rangeExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const average = rangeExpenses.length ? total / rangeExpenses.length : 0
  const largest = rangeExpenses.reduce<ExpenseRecord | null>((top, expense) => !top || expense.amount > top.amount ? expense : top, null)
  const rangeCategories = new Map<string, number>()
  rangeExpenses.forEach((expense) => categoryAllocations(expense).forEach(({ category, amount }) => rangeCategories.set(category, (rangeCategories.get(category) ?? 0) + amount)))
  const categorySummary = [...rangeCategories].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5)
  const history = chartHistory(rangeExpenses, range, bounds.from, bounds.to)
  const hasAny = expenses.length > 0

  return <>
    <section className="stats-grid" aria-label={`${rangeLabel} at a glance`}>
      <article className="stat-card"><div className="stat-top"><span>Total spent · {rangeLabel}</span><span className="stat-icon spent-icon"><TrendingUp size={18}/></span></div><div className="stat-value">{rangeExpenses.length ? currency(total) : '—'}</div><div className="stat-bottom">{rangeExpenses.length ? `Across ${rangeExpenses.length} recorded expense${rangeExpenses.length === 1 ? '' : 's'} in ${rangeDescription}` : `No expenses recorded in ${rangeDescription}`}</div></article>
      <article className="stat-card"><div className="stat-top"><span>Transactions</span><span className="stat-icon balance-icon"><ReceiptText size={18}/></span></div><div className="stat-value">{rangeExpenses.length}</div><div className="stat-bottom">{rangeLabel}</div></article>
      <article className="stat-card"><div className="stat-top"><span>Average expense</span><span className="stat-icon budget-icon"><ReceiptText size={18}/></span></div><div className="stat-value">{rangeExpenses.length ? currency(average) : '—'}</div><div className="stat-bottom">{rangeExpenses.length ? `Per transaction · ${rangeLabel}` : 'Add expenses to calculate an average'}</div></article>
      <article className="stat-card"><div className="stat-top"><span>Largest expense</span><span className="stat-icon saved-icon"><ArrowUpRight size={18}/></span></div><div className="stat-value">{largest ? currency(largest.amount) : '—'}</div><div className="stat-bottom">{largest ? largest.merchant : `No expenses recorded in ${rangeDescription}`}</div></article>
    </section>

    <section className="middle-grid"><article className="panel spending-panel"><div className="panel-heading"><div><h2>Spending · {rangeLabel}</h2><p>Totals from saved expenses in the selected period</p></div><button className="select-button" onClick={onOpenExpenses}>View expenses <ArrowUpRight size={14}/></button></div><SixMonthChart history={history} rangeLabel={rangeLabel}/></article>
      <article className="panel categories-panel"><div className="panel-heading"><div><h2>Category breakdown</h2><p>{rangeLabel} · apportioned to item categories</p></div></div>{categorySummary.length ? <><div className="category-list">{categorySummary.map((category) => <div className="category-row" key={category.name}><div className="category-icon" style={{backgroundColor:`${categoryColors[category.name] ?? categoryColors.Other}22`}}>{category.name === 'Personal Care' ? '🧴' : '◈'}</div><div className="category-detail"><div className="category-label"><b>{category.name}</b><span>{currency(category.amount)}</span></div><div className="category-track"><span style={{width:`${total ? Math.min(category.amount / total * 100, 100) : 0}%`,backgroundColor:categoryColors[category.name] ?? categoryColors.Other}}/></div></div></div>)}</div><button className="text-link" onClick={onOpenExpenses}>View all expenses <ArrowUpRight size={14}/></button></> : <div className="dashboard-empty compact"><span>◈</span><b>No category activity in this range</b><p>Saved expenses in the selected range will be grouped by item categories.</p></div>}</article></section>

    <section className="bottom-grid"><article className="panel transactions-panel"><div className="panel-heading transaction-heading"><div><h2>Transactions · {rangeLabel}</h2><p>Latest expenses in the selected range</p></div><button className="text-link" onClick={onOpenExpenses}>See all <ArrowUpRight size={14}/></button></div>{rangeExpenses.length ? <><div className="transaction-table"><div className="table-head"><span>MERCHANT</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span></div>{rangeExpenses.slice(0, 5).map((expense) => <div className="transaction-row" key={expense.id}><div className="merchant-cell"><span className={`merchant-icon ${expense.tone}`}>{expense.icon}</span><b>{expense.merchant}</b></div><span className="category-cell">{expense.category}</span><span className="date-cell">{formatDate(expense.date, dateFormat)}</span><b className="amount-cell">{currency(expense.amount)}</b></div>)}</div><div className="mobile-transactions">{rangeExpenses.slice(0, 5).map((expense) => <div className="mobile-transaction" key={expense.id}><span className={`merchant-icon ${expense.tone}`}>{expense.icon}</span><div><b>{expense.merchant}</b><small>{expense.category} · {formatDate(expense.date, dateFormat)}</small></div><strong>{currency(expense.amount)}</strong></div>)}</div></> : <div className="dashboard-empty"><span>🧾</span><b>{hasAny ? 'No transactions in this range' : 'Your first expense starts here'}</b><p>{hasAny ? `Choose a different date range to view saved expenses.` : 'Scan a receipt or add an expense to see your activity.'}</p>{!hasAny && <button className="primary-button" onClick={onOpenExpenses}>Add an expense</button>}</div>}</article>
      <article className="panel dashboard-budget-card"><div className="panel-heading"><div><h2>Budget progress</h2><p>{rangeLabel} · monthly limits prorated by days in the selected period</p></div><button className="text-link" onClick={onOpenBudgets}>Manage <ArrowUpRight size={14}/></button></div>{budgets.slice(0, 3).map((budget) => { const spent = rangeCategories.get(budget.category) ?? 0; const allowance = budgetAllowanceForPeriod(budget.limit, bounds.from, bounds.to); const progress = allowance ? spent / allowance * 100 : 0; return <div className="budget-mini-row" key={budget.id}><div><b>{budget.category}</b><span>{currency(spent)} / {currency(allowance)}</span></div><div className="category-track"><span style={{width:`${Math.min(progress, 100)}%`,background:spent >= allowance ? '#b65b4b' : progress >= 80 ? '#d4a057' : categoryColors[budget.category] ?? categoryColors.Other}}/></div></div>})}{budgets.length === 0 && <div className="dashboard-empty compact"><b>No budgets set</b><p>Create monthly limits and track category progress here.</p><button className="text-link" onClick={onOpenBudgets}>Set up budgets <ArrowUpRight size={14}/></button></div>}<button className="text-link" onClick={onOpenBudgets}>View all budgets <ArrowUpRight size={14}/></button></article></section>
    <p className="dashboard-note">All figures are calculated from expenses saved in Pennywise.</p>
    <div className="sr-only" aria-live="polite">{rangeExpenses.length ? `${rangeLabel}: ${rangeExpenses.length} transactions totaling ${currency(total)}.` : `No expenses recorded in ${rangeDescription}.`}</div>
  </>
}

function SixMonthChart({ history, rangeLabel }: { history: ChartPoint[]; rangeLabel: string }) {
  const hasHistory = history.some((entry) => entry.total > 0)
  if (!hasHistory) return <div className="six-chart"><div className="six-chart-empty">No spending recorded for this period. Choose another date range to view a different period.</div></div>
  const ceiling = Math.max(...history.map((entry) => entry.total), 1000)
  return <div className="six-chart" role="img" aria-label={`${rangeLabel} spending chart: ${history.map((entry) => `${entry.label} ${currency(entry.total)}`).join(', ')}`}><div className="six-chart-grid"><span>{currency(ceiling)}</span><span>{currency(ceiling / 2)}</span><span>₹0</span></div><div className="six-chart-bars">{history.map((entry) => <div key={entry.key} className="six-chart-column"><div className={`six-bar ${entry.key === history[history.length - 1]?.key ? 'current' : ''}`} style={{height:`${Math.max(entry.total ? 5 : 0, entry.total / ceiling * 100)}%`}} title={`${entry.label}: ${currency(entry.total)}, ${entry.count} transactions`}>{entry.total > 0 && <span>{currency(entry.total)}</span>}</div><small>{entry.label}</small></div>)}</div></div>
}
