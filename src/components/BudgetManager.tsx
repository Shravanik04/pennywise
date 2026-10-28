import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, LoaderCircle, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react'
import type { ExpenseRecord, MonthlyBudget } from '../expenseStore'
import { categoryAllocations, currency, isCurrentMonth } from '../finance'

const budgetCategories = ['Food & drink', 'Groceries', 'Personal Care', 'Transport', 'Shopping', 'Bills', 'Health', 'Subscriptions', 'Other']
type Props = { expenses: ExpenseRecord[]; budgets: MonthlyBudget[]; onSave: (budgets: MonthlyBudget[]) => Promise<void>; onNotify: (message: string) => void }

export default function BudgetManager({ expenses, budgets, onSave, onNotify }: Props) {
  const [editing, setEditing] = useState<MonthlyBudget | null>(null)
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const currentMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  useEffect(() => {
    if (!editing) return
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
    const focusTimer = window.setTimeout(() => focusable()[0]?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setEditing(null); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.clearTimeout(focusTimer); window.removeEventListener('keydown', onKeyDown) }
  }, [editing, busy])
  const spending = useMemo(() => {
    const totals = new Map<string, number>()
    expenses.filter((expense) => isCurrentMonth(expense.date)).forEach((expense) => categoryAllocations(expense).forEach(({ category: name, amount }) => totals.set(name, (totals.get(name) ?? 0) + amount)))
    return totals
  }, [expenses])

  const startCreate = () => {
    const available = budgetCategories.find((name) => !budgets.some((budget) => budget.category === name))
    setEditing({ id: crypto.randomUUID(), category: available ?? budgetCategories[0], limit: 0 })
    setCategory(available ?? budgetCategories[0])
    setLimit('')
    setError('')
  }
  const startEdit = (budget: MonthlyBudget) => { setEditing(budget); setCategory(budget.category); setLimit(String(budget.limit)); setError('') }
  const save = async () => {
    const amount = Number(limit)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a budget limit greater than ₹0.'); return }
    if (budgets.some((budget) => budget.category === category && budget.id !== editing?.id)) { setError('A budget already exists for this category. Edit its limit instead.'); return }
    setBusy(true)
    try {
      const updated = editing ? [...budgets.filter((budget) => budget.id !== editing.id), { ...editing, category, limit: amount }] : [...budgets, { id: crypto.randomUUID(), category, limit: amount }]
      await onSave(updated)
      setEditing(null)
      onNotify('Monthly budget saved.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this budget.') }
    finally { setBusy(false) }
  }
  const remove = async (budget: MonthlyBudget) => {
    setBusy(true)
    try {
      await onSave(budgets.filter((item) => item.id !== budget.id))
      onNotify(`${budget.category} budget deleted.`)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'Could not delete this budget.')
    } finally { setBusy(false) }
  }

  return <section className="budget-manager">
    <div className="budget-page-heading"><div><div className="eyebrow">A LITTLE STRUCTURE, A LOT OF PEACE</div><h2>Monthly budgets</h2><p>{currentMonth} · spent amounts use saved receipt item categories.</p></div><button className="primary-button" onClick={startCreate} disabled={budgets.length >= budgetCategories.length}><Plus size={16}/> Create budget</button></div>
    {budgets.length ? <div className="budget-cards">{budgets.map((budget) => {
      const spent = spending.get(budget.category) ?? 0
      const percent = spent / budget.limit * 100
      const exceeded = percent > 100
      const nearLimit = percent >= 80 && !exceeded
      const remaining = Math.max(0, budget.limit - spent)
      return <article className={`budget-card ${exceeded ? 'budget-exceeded' : nearLimit ? 'budget-near' : ''}`} key={budget.id}><div className="budget-card-head"><span className="budget-category-icon"><Wallet size={17}/></span><div><h3>{budget.category}</h3><p>{currency(spent)} spent of {currency(budget.limit)}</p></div><button className="icon-button" onClick={() => startEdit(budget)} aria-label={`Edit ${budget.category} budget`}><Pencil size={16}/></button><button className="icon-button" disabled={busy} onClick={() => void remove(budget)} aria-label={`Delete ${budget.category} budget`}><Trash2 size={16}/></button></div><div className="budget-meter" role="progressbar" aria-label={`${budget.category} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(percent))}><span style={{width:`${Math.min(100, percent)}%`}}/></div><div className="budget-figures"><span>{exceeded ? `${currency(spent - budget.limit)} over limit` : `${currency(remaining)} remaining`}</span><b>{Math.round(percent)}%</b></div>{exceeded ? <div className="budget-alert exceeded"><AlertTriangle size={15}/><span>Over budget by {currency(spent - budget.limit)}. Consider adjusting your plan.</span></div> : nearLimit ? <div className="budget-alert warning"><AlertTriangle size={15}/><span>You’ve used at least 80% of this budget.</span></div> : <div className="budget-alert okay"><Check size={15}/><span>Within your monthly limit.</span></div>}</article>
    })}</div> : <div className="budget-empty"><span className="budget-empty-icon"><Wallet size={22}/></span><h3>No monthly budgets yet</h3><p>Create category budgets to track your spending and get a heads-up at 80%.</p><button className="primary-button" onClick={startCreate}><Plus size={16}/> Create your first budget</button></div>}
    {editing && <div className="expense-modal-backdrop" onClick={() => !busy && setEditing(null)}><section ref={(node) => { dialogRef.current = node }} className="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-dialog-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">MONTHLY PLAN</span><h2 id="budget-dialog-title">{budgets.some((budget) => budget.id === editing.id) ? 'Edit budget' : 'New budget'}</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Close budget form"><X size={18}/></button></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{budgetCategories.filter((name) => !budgets.some((budget) => budget.category === name && budget.id !== editing.id)).map((name) => <option key={name}>{name}</option>)}</select></label><label>Monthly limit (₹)<input type="number" min="1" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="e.g. 10000"/></label>{error && <p className="budget-form-error" role="alert">{error}</p>}<div className="review-actions"><button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" onClick={() => void save()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} Save budget</button></div><p className="budget-dialog-note">Budgets apply to the current calendar month and are saved on this device.</p></section></div>}
  </section>
}
