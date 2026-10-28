import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { ExpenseRecord, MonthlyBudget } from './expenseStore'
import type { ReceiptItem } from './receiptOcr'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonymousKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export type CloudConfiguration = { mode: 'configured' } | { mode: 'missing'; message: string } | { mode: 'invalid'; message: string }

export function cloudConfiguration(): CloudConfiguration {
  if (!url && !anonymousKey) return { mode: 'missing', message: 'Supabase is not configured. Expenses stay in this browser and do not sync between devices.' }
  if (!url || !anonymousKey) return { mode: 'invalid', message: 'Supabase configuration is incomplete. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; cloud sync is disabled.' }
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') throw new Error('Use an HTTPS Supabase project URL.')
  } catch {
    return { mode: 'invalid', message: 'VITE_SUPABASE_URL is invalid. Cloud sync is disabled until a valid Supabase URL and anon key are provided.' }
  }
  return { mode: 'configured' }
}

let client: SupabaseClient | null = null
export function getSupabaseClient() {
  if (cloudConfiguration().mode !== 'configured') return null
  client ??= createClient(url, anonymousKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

type CloudExpenseRow = {
  id: string
  user_id: string
  merchant: string
  transaction_date: string
  amount: number
  category: string
  items: ExpenseRecord['items']
  tax: number | null
  subtotal: number | null
  receipt_name: string | null
  receipt_type: string | null
  icon: string
  tone: string
  created_at: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const isReceiptItem = (value: unknown): value is ReceiptItem => isRecord(value)
  && typeof value.id === 'string' && typeof value.name === 'string'
  && typeof value.category === 'string' && Number.isFinite(value.price)

const toExpense = (row: CloudExpenseRow): ExpenseRecord => {
  const amount = Number(row.amount)
  const createdAt = Number(row.created_at)
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.merchant !== 'string' || !row.merchant.trim()
    || typeof row.transaction_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date)
    || !Number.isFinite(amount) || amount <= 0 || typeof row.category !== 'string' || !row.category
    || !Array.isArray(row.items) || !row.items.every(isReceiptItem)
    || (row.tax !== null && (!Number.isFinite(Number(row.tax)) || Number(row.tax) < 0))
    || (row.subtotal !== null && (!Number.isFinite(Number(row.subtotal)) || Number(row.subtotal) < 0))
    || (row.receipt_name !== null && typeof row.receipt_name !== 'string')
    || (row.receipt_type !== null && typeof row.receipt_type !== 'string')
    || typeof row.icon !== 'string' || !row.icon || typeof row.tone !== 'string' || !row.tone || !Number.isFinite(createdAt)) {
    throw new Error('Supabase returned an expense with invalid saved fields. Check the expense table data.')
  }
  return {
    id: row.id,
    merchant: row.merchant,
    date: row.transaction_date,
    amount,
    category: row.category,
    items: row.items,
    tax: row.tax === null ? null : Number(row.tax),
    subtotal: row.subtotal === null ? null : Number(row.subtotal),
    ...(row.receipt_name ? { receiptName: row.receipt_name } : {}),
    ...(row.receipt_type ? { receiptType: row.receipt_type } : {}),
    icon: row.icon,
    tone: row.tone,
    createdAt,
  }
}

const toRow = (expense: ExpenseRecord, userId: string): CloudExpenseRow => ({
  id: expense.id,
  user_id: userId,
  merchant: expense.merchant,
  transaction_date: expense.date,
  amount: expense.amount,
  category: expense.category,
  items: expense.items,
  tax: expense.tax,
  subtotal: expense.subtotal,
  receipt_name: expense.receiptName ?? null,
  receipt_type: expense.receiptType ?? null,
  icon: expense.icon,
  tone: expense.tone,
  created_at: expense.createdAt,
})

export async function loadCloudExpenses(userId: string): Promise<ExpenseRecord[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('expenses').select('*').eq('user_id', userId).order('transaction_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw new Error(`Could not load cloud expenses: ${error.message}`)
  return (data as CloudExpenseRow[]).map(toExpense)
}

export async function saveCloudExpense(expense: ExpenseRecord, userId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('expenses').upsert(toRow(expense, userId), { onConflict: 'id' })
  if (error) throw new Error(`Could not save cloud expense: ${error.message}`)
}

export async function deleteCloudExpense(id: string, userId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(`Could not delete cloud expense: ${error.message}`)
}

export async function loadCloudBudgets(userId: string): Promise<MonthlyBudget[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('budgets').select('id, user_id, category, monthly_limit').eq('user_id', userId)
  if (error) throw new Error(`Could not load cloud budgets: ${error.message}`)
  return data.map((row): MonthlyBudget => {
    const limit = Number(row.monthly_limit)
    if (typeof row.id !== 'string' || row.user_id !== userId || typeof row.category !== 'string' || !Number.isFinite(limit) || limit <= 0) {
      throw new Error('Supabase returned a budget with invalid saved fields. Check the budgets table data.')
    }
    return { id: row.id, category: row.category, limit }
  })
}

export async function saveCloudBudgets(budgets: MonthlyBudget[], userId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  if (budgets.length) {
    const { error } = await supabase.from('budgets').upsert(budgets.map((budget) => ({
      id: budget.id,
      user_id: userId,
      category: budget.category,
      monthly_limit: budget.limit,
    })), { onConflict: 'id' })
    if (error) throw new Error(`Could not save cloud budgets: ${error.message}`)
    const retainedIds = budgets.map((budget) => budget.id)
    const { error: deleteError } = await supabase.from('budgets').delete().eq('user_id', userId).not('id', 'in', `(${retainedIds.join(',')})`)
    if (deleteError) throw new Error(`Budgets were saved, but removed budgets could not be synchronized: ${deleteError.message}`)
    return
  }
  const { error } = await supabase.from('budgets').delete().eq('user_id', userId)
  if (error) throw new Error(`Could not delete cloud budgets: ${error.message}`)
}

export function subscribeToCloudData(userId: string, onChange: () => void, onStatus: (connected: boolean, detail?: string) => void) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const channel = supabase.channel(`private-finance:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe((status, error) => {
    onStatus(status === 'SUBSCRIBED', status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? error?.message ?? status : undefined)
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('Supabase expense updates are unavailable.', error)
  })
  return () => { void supabase.removeChannel(channel) }
}

export type { User }
