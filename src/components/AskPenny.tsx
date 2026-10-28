import { useMemo, useState } from 'react'
import { ArrowUpRight, Send, Sparkles } from 'lucide-react'
import type { ExpenseRecord } from '../expenseStore'
import { categoryAllocations, currency, isCurrentMonth, readableMonth } from '../finance'

type Props = { expenses: ExpenseRecord[] }
type Answer = { title: string; value: string; explanation: string; rows: string[] }
const suggestions = ['How much did I spend on food this month?', 'What was my biggest expense?', 'How much did I spend on groceries last month?']

function answerQuestion(question: string, expenses: ExpenseRecord[]): Answer {
  const q = question.toLowerCase()
  const month = new Date()
  const label = readableMonth(month)
  const current = expenses.filter((expense) => isCurrentMonth(expense.date))
  if (expenses.length === 0) return { title: 'Not enough expense data', value: '—', explanation: 'Save an expense first. Answers here are calculated from your saved expenses; nothing is inferred or generated when there is no history.', rows: [] }
  if (/biggest|largest|most expensive|highest/.test(q)) {
    const searchPool = /\b(this month|monthly|in october|in january|in february|in march|in april|in may|in june|in july|in august|in september|in november|in december)\b/.test(q) ? current : expenses
    const biggest = searchPool.reduce<ExpenseRecord | null>((top, expense) => !top || expense.amount > top.amount ? expense : top, null)
    if (!biggest) return { title: `No expenses in ${label}`, value: '—', explanation: 'There are no saved transactions in the selected period, so there is not enough data to calculate a largest expense.', rows: [] }
    return { title: biggest.merchant, value: currency(biggest.amount), explanation: searchPool === current ? `I compared ${current.length} saved transactions in ${label} and selected the largest receipt total.` : `I compared all ${expenses.length} saved transactions and selected the largest receipt total.`, rows: [`${new Date(`${biggest.date}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · ${biggest.category}`] }
  }
  const keywordMap: Array<[RegExp, string[]]> = [
    [/food|restaurant|cafe|dining|eat|coffee/, ['Food & drink']], [/grocer|dmart|supermarket|milk|biscuits?/, ['Groceries']], [/personal care|shampoo|soap|toothpaste/, ['Personal Care']], [/transport|travel|uber|ola|fuel|petrol/, ['Transport']], [/shopping|shop|clothes/, ['Shopping']], [/bill|utility|electricity|internet/, ['Bills']], [/health|medical|pharmacy|medicine/, ['Health']], [/subscription|netflix|spotify/, ['Subscriptions']],
  ]
  const matched = keywordMap.find(([pattern]) => pattern.test(q))
  const categoryNames = matched?.[1]
  const asksForTotal = /\b(total|overall|all|everything|how much did i spend|my spending this month)\b/.test(q)
  const asksForMonthComparison = /\b(last month|previous month|prior month)\b/.test(q)
  const monthNameMatch = q.match(/\b(?:in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\b/)
  if (!categoryNames && !asksForTotal) return { title: 'Try a spending question', value: '—', explanation: 'I can calculate this month’s total spending, category totals (food, groceries, transport, and more), or your biggest expense from saved records.', rows: [] }
  const comparisonMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const requestedMonth = monthNameMatch ? new Date(`${monthNameMatch[1]} 1, ${month.getFullYear()}`) : month
  const selectedMonth = asksForMonthComparison && !monthNameMatch ? comparisonMonth : requestedMonth
  const targetMonth = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
  const targetLabel = readableMonth(selectedMonth)
  const periodExpenses = expenses.filter((expense) => expense.date.slice(0, 7) === targetMonth)
  const subset = periodExpenses.filter((expense) => !categoryNames || categoryAllocations(expense).some((allocation) => categoryNames.includes(allocation.category)))
  if (subset.length === 0) return { title: 'Not enough matching expense data', value: '—', explanation: periodExpenses.length ? `No saved expenses match ${categoryNames?.join(', ') ?? 'that question'} in ${targetLabel}.` : `No expenses are saved for ${targetLabel}, so there is not enough data to calculate an answer.` , rows: [] }
  const amount = subset.reduce((sum, expense) => sum + (categoryNames ? categoryAllocations(expense).filter((allocation) => categoryNames.includes(allocation.category)).reduce((sub, allocation) => sub + allocation.amount, 0) : expense.amount), 0)
  const title = categoryNames ? `${categoryNames.join(' / ')} · ${targetLabel}` : `Total spending · ${targetLabel}`
  const rows = subset.map((expense) => {
    const allocated = categoryNames ? categoryAllocations(expense).filter((item) => categoryNames.includes(item.category)).reduce((sum, item) => sum + item.amount, 0) : expense.amount
    return `${expense.merchant} · ${currency(allocated)}`
  })
  return {
    title, value: currency(amount),
    explanation: categoryNames ? `I matched “${categoryNames.join(', ')}” to saved item categories and added ${subset.length} matching receipt allocation${subset.length === 1 ? '' : 's'} dated in ${targetLabel}.` : `I added ${subset.length} saved transactions dated in ${targetLabel}.`,
    rows,
  }
}

export default function AskPenny({ expenses }: Props) {
  const [question, setQuestion] = useState('')
  const [submitted, setSubmitted] = useState('')
  const currentAnswer = useMemo(() => submitted ? answerQuestion(submitted, expenses) : null, [submitted, expenses])
  const ask = (value = question) => { if (!value.trim()) return; setSubmitted(value.trim()); setQuestion('') }

  return <section className="ask-page"><div className="ask-hero ask-data-hero"><div className="ask-sparkle"><Sparkles size={24}/></div><span className="eyebrow">CALCULATIONS FROM YOUR DATA</span><h2>Ask Penny about your spending.</h2><p>Get a quick answer calculated from expenses saved to your account or this device.</p><span className="data-based-badge"><Sparkles size={13}/> Expense-based calculations · no AI service connected</span><div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)}>{suggestion} <ArrowUpRight size={14}/></button>)}</div>{currentAnswer && <article className="penny-answer" aria-live="polite"><div className="answer-title"><span className="penny-avatar">✳</span><div><small>BASED ON YOUR SAVED EXPENSES</small><b>{currentAnswer.title}</b></div></div><strong className="answer-value">{currentAnswer.value}</strong><p>{currentAnswer.explanation}</p>{currentAnswer.rows.length > 0 && <details><summary>Show calculation details ({currentAnswer.rows.length})</summary><ul>{currentAnswer.rows.map((row) => <li key={row}>{row}</li>)}</ul></details>}</article>}<div className="ask-input"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && ask()} placeholder="Try “What was my biggest expense?”" aria-label="Ask Penny a question"/><button aria-label="Calculate answer" onClick={() => ask()}><Send size={17}/></button></div><small className="local-ai-note">Penny calculates answers from saved records. It does not connect to or claim to use an AI model.</small></div></section>
}
