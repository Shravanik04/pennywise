import type { ExpenseRecord } from './expenseStore'

export const todayKey = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
export const isCurrentMonth = (date: string) => date.slice(0, 7) === monthKey(new Date())
export const currency = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
export const readableMonth = (date: Date, short = false) => new Intl.DateTimeFormat('en-IN', { month: short ? 'short' : 'long', year: 'numeric' }).format(date)

export function categoryAllocations(expense: Pick<ExpenseRecord, 'amount' | 'subtotal' | 'items' | 'category'>) {
  const categories = new Map<string, number>()
  const sum = expense.items.reduce((total, item) => total + Math.max(0, item.price), 0)
  if (!sum) return [{ category: expense.category, amount: expense.amount }]
  expense.items.forEach((item) => {
    categories.set(item.category, (categories.get(item.category) ?? 0) + expense.amount * Math.max(0, item.price) / sum)
  })
  const allocated = [...categories].map(([category, amount]) => ({ category, amount }))
  const roundingRemainder = expense.amount - allocated.reduce((total, item) => total + item.amount, 0)
  if (allocated.length) allocated[0].amount += roundingRemainder
  return allocated
}

export type MonthlyPoint = { month: string; label: string; total: number; count: number }
export function monthlyHistory(expenses: ExpenseRecord[], count = 6): MonthlyPoint[] {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - index - 1), 1)
    const key = monthKey(date)
    const inMonth = expenses.filter((expense) => expense.date.slice(0, 7) === key)
    return { month: key, label: readableMonth(date, true), total: inMonth.reduce((sum, expense) => sum + expense.amount, 0), count: inMonth.length }
  })
}

export function monthCategoryTotals(expenses: ExpenseRecord[], month: string) {
  const totals = new Map<string, number>()
  expenses.filter((expense) => expense.date.slice(0, 7) === month).forEach((expense) => {
    categoryAllocations(expense).forEach(({ category, amount }) => totals.set(category, (totals.get(category) ?? 0) + amount))
  })
  return totals
}

export function detectRecurring(expenses: ExpenseRecord[]) {
  const merchants = new Map<string, ExpenseRecord[]>()
  expenses.forEach((expense) => {
    const key = expense.merchant.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    if (!key) return
    merchants.set(key, [...(merchants.get(key) ?? []), expense])
  })
  return [...merchants.entries()].flatMap(([key, records]) => {
    const byDate = new Map<string, ExpenseRecord>()
    records.forEach((record) => {
      const previous = byDate.get(record.date)
      if (!previous || record.createdAt > previous.createdAt) byDate.set(record.date, record)
    })
    const uniqueByDate = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    if (uniqueByDate.length < 3) return []
    const amounts = uniqueByDate.map((record) => record.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (median <= 0 || amounts[amounts.length - 1] - amounts[0] > Math.max(median * 0.15, 100)) return []
    const dateToDay = (value: string) => {
      const [year, month, day] = value.split('-').map(Number)
      return Date.UTC(year, month - 1, day) / 86_400_000
    }
    const dates = uniqueByDate.map((record) => dateToDay(record.date))
    const gaps = dates.slice(1).map((date, index) => date - dates[index])
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    const likelyFrequency = averageGap >= 5 && averageGap <= 10 ? 'Weekly' : averageGap >= 25 && averageGap <= 35 ? 'Monthly' : averageGap >= 80 && averageGap <= 100 ? 'Quarterly' : averageGap >= 300 && averageGap <= 430 ? 'Yearly' : null
    if (!likelyFrequency || gaps.some((gap) => Math.abs(gap - averageGap) > averageGap * 0.3)) return []
    const next = new Date((dates[dates.length - 1] + averageGap) * 86_400_000)
    const latest = uniqueByDate[uniqueByDate.length - 1]
    return [{ key, merchant: latest.merchant, amount: median, frequency: likelyFrequency, nextDate: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`, occurrences: uniqueByDate.length, dates: uniqueByDate.map((record) => record.date) }]
  })
}
