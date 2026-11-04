import type { ReceiptItem } from './receiptOcr'

export type ExpenseRecord = {
  id: string
  merchant: string
  date: string
  amount: number
  category: string
  items: ReceiptItem[]
  tax: number | null
  subtotal: number | null
  receiptName?: string
  receiptType?: string
  icon: string
  tone: string
  createdAt: number
}

const DATABASE = 'pennywise-local'
const STORE = 'expenses'
const RECEIPTS = 'receipts'
const META = 'metadata'
let databasePromise: Promise<IDBDatabase> | undefined
const newestFirst = (records: ExpenseRecord[]) => records.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
const changes = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('pennywise-browser-data')
const notifyChange = () => changes?.postMessage({ changed: true })
export const subscribeToStorageChanges = (onChange: () => void) => {
  if (!changes) return () => {}
  changes.addEventListener('message', onChange)
  return () => changes.removeEventListener('message', onChange)
}

export type MonthlyBudget = { id: string; category: string; limit: number }
export type DateFormat = 'd-mmm-yyyy' | 'dd/mm/yyyy' | 'yyyy-mm-dd'
export type AppPreferences = { dateFormat: DateFormat }
export const DEFAULT_PREFERENCES: AppPreferences = { dateFormat: 'd-mmm-yyyy' }
const PREFERENCES_KEY = 'app-preferences'

function getDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local receipt storage.'))
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(RECEIPTS)) request.result.createObjectStore(RECEIPTS, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(META)) request.result.createObjectStore(META)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local expense storage.'))
  })
  return databasePromise
}

function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return getDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = action(tx.objectStore(STORE))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Could not save local expense data.'))
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error ?? new Error('Could not save local expense data.'))
    tx.onabort = () => reject(tx.error ?? new Error('Local expense storage was interrupted.'))
  }))
}

export async function loadExpenses(): Promise<ExpenseRecord[]> {
  const records = await transaction<ExpenseRecord[]>('readonly', (store) => store.getAll())
  const demoIds = new Set(['sample-1', 'sample-2', 'sample-3', 'sample-4', 'sample-5', 'sample-recurring-netflix-1', 'sample-recurring-netflix-2'])
  const validRecords = records.filter(isValidExpense)
  const demoRecords = records.filter((record) => record && typeof record === 'object' && demoIds.has(record.id))
  if (demoRecords.length) {
    const db = await getDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      demoRecords.forEach((record) => tx.objectStore(STORE).delete(record.id))
      tx.oncomplete = () => { notifyChange(); resolve() }
      tx.onerror = () => reject(tx.error ?? new Error('Could not remove known sample expenses.'))
      tx.onabort = () => reject(tx.error ?? new Error('Sample expense cleanup was interrupted.'))
    })
  }
  return newestFirst(validRecords.filter((record) => !demoIds.has(record.id)))
}

const isValidExpense = (value: unknown): value is ExpenseRecord => {
  if (!value || typeof value !== 'object') return false
  const expense = value as Partial<ExpenseRecord>
  return typeof expense.id === 'string' && typeof expense.merchant === 'string' && typeof expense.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(expense.date) && Number.isFinite(expense.amount) && Number(expense.amount) > 0
    && typeof expense.category === 'string' && Array.isArray(expense.items)
    && expense.items.every((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.category === 'string' && Number.isFinite(item.price))
    && (expense.tax === null || Number.isFinite(expense.tax)) && (expense.subtotal === null || Number.isFinite(expense.subtotal))
    && typeof expense.icon === 'string' && typeof expense.tone === 'string' && Number.isFinite(expense.createdAt)
}

const isValidBudget = (value: unknown): value is MonthlyBudget => {
  if (!value || typeof value !== 'object') return false
  const budget = value as Partial<MonthlyBudget>
  return typeof budget.id === 'string' && typeof budget.category === 'string' && Number.isFinite(budget.limit) && Number(budget.limit) > 0
}

export async function loadBudgets(owner = 'local'): Promise<MonthlyBudget[]> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const store = db.transaction(META, 'readonly').objectStore(META)
    const request = store.get(`monthly-budgets:${owner}`)
    request.onsuccess = () => {
      if (Array.isArray(request.result)) {
        resolve(request.result.filter(isValidBudget))
        return
      }
      if (owner !== 'local') {
        resolve([])
        return
      }
      const legacy = store.get('monthly-budgets')
      legacy.onsuccess = () => resolve(Array.isArray(legacy.result) ? legacy.result.filter(isValidBudget) : [])
      legacy.onerror = () => reject(legacy.error ?? new Error('Could not read existing monthly budgets.'))
    }
    request.onerror = () => reject(request.error ?? new Error('Could not load monthly budgets.'))
  })
}

export async function saveBudgets(budgets: MonthlyBudget[], owner = 'local') {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(budgets.filter(isValidBudget), `monthly-budgets:${owner}`)
    tx.oncomplete = () => { notifyChange(); resolve() }
    tx.onerror = () => reject(tx.error ?? new Error('Could not save monthly budgets.'))
    tx.onabort = () => reject(tx.error ?? new Error('Budget saving was interrupted.'))
  })
}

export async function loadPreferences(): Promise<AppPreferences> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(META, 'readonly').objectStore(META).get(PREFERENCES_KEY)
    request.onsuccess = () => {
      const saved = request.result as Partial<AppPreferences> | undefined
      const dateFormat = saved?.dateFormat
      resolve(dateFormat === 'd-mmm-yyyy' || dateFormat === 'dd/mm/yyyy' || dateFormat === 'yyyy-mm-dd'
        ? { dateFormat }
        : DEFAULT_PREFERENCES)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not load Pennywise preferences.'))
  })
}

export async function savePreferences(preferences: AppPreferences) {
  if (!['d-mmm-yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd'].includes(preferences.dateFormat)) {
    throw new Error('Choose a supported date format.')
  }
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(preferences, PREFERENCES_KEY)
    tx.oncomplete = () => { notifyChange(); resolve() }
    tx.onerror = () => reject(tx.error ?? new Error('Could not save Pennywise preferences.'))
    tx.onabort = () => reject(tx.error ?? new Error('Saving Pennywise preferences was interrupted.'))
  })
}

export async function clearLocalBrowserData() {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, RECEIPTS, META], 'readwrite')
    tx.objectStore(STORE).clear()
    tx.objectStore(RECEIPTS).clear()
    tx.objectStore(META).clear()
    tx.oncomplete = () => { notifyChange(); resolve() }
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear this browser’s Pennywise data.'))
    tx.onabort = () => reject(tx.error ?? new Error('Clearing this browser’s Pennywise data was interrupted.'))
  })
}

export type RecurringDecision = 'confirmed' | 'dismissed'
export type RecurringDecisions = Record<string, RecurringDecision>

export async function loadRecurringDecisions(owner = 'local'): Promise<RecurringDecisions> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const store = db.transaction(META, 'readonly').objectStore(META)
    const request = store.get(`recurring-decisions:${owner}`)
    request.onsuccess = () => {
      const saved = request.result
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        resolve(Object.fromEntries(Object.entries(saved).filter(([, value]) => value === 'confirmed' || value === 'dismissed')) as RecurringDecisions)
        return
      }
      if (owner !== 'local') {
        resolve({})
        return
      }
      const legacy = store.get('recurring-decisions')
      legacy.onsuccess = () => {
        const values = legacy.result
        resolve(values && typeof values === 'object' && !Array.isArray(values) ? Object.fromEntries(Object.entries(values).filter(([, value]) => value === 'confirmed' || value === 'dismissed')) as RecurringDecisions : {})
      }
      legacy.onerror = () => reject(legacy.error ?? new Error('Could not read existing recurring-payment preferences.'))
    }
    request.onerror = () => reject(request.error ?? new Error('Could not load recurring-payment preferences.'))
  })
}

export async function saveRecurringDecision(key: string, decision: RecurringDecision, owner = 'local') {
  const decisions = await loadRecurringDecisions(owner)
  decisions[key] = decision
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(decisions, `recurring-decisions:${owner}`)
    tx.oncomplete = () => { notifyChange(); resolve() }
    tx.onerror = () => reject(tx.error ?? new Error('Could not save recurring-payment preference.'))
    tx.onabort = () => reject(tx.error ?? new Error('Saving recurring-payment preference was interrupted.'))
  })
}

export function saveExpense(expense: ExpenseRecord, receiptFile?: File) {
  if (receiptFile) return transaction<IDBValidKey>('readwrite', (store) => store.put({ ...expense, receiptFile })).then((result) => { notifyChange(); return result })
  return getDatabase().then((db) => new Promise<IDBValidKey>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const lookup = store.get(expense.id)
    lookup.onsuccess = () => {
      const previous = lookup.result as (ExpenseRecord & { receiptFile?: File }) | undefined
      store.put({ ...expense, receiptFile: previous?.receiptFile })
    }
    lookup.onerror = () => reject(lookup.error ?? new Error('Could not update the expense.'))
    tx.oncomplete = () => { notifyChange(); resolve(expense.id) }
    tx.onerror = () => reject(tx.error ?? new Error('Could not update the expense.'))
    tx.onabort = () => reject(tx.error ?? new Error('Expense update was interrupted.'))
  }))
}

export function deleteExpense(id: string) {
  return transaction<undefined>('readwrite', (store) => store.delete(id)).then((result) => { notifyChange(); return result })
}

export function openReceipt(id: string) {
  return transaction<ExpenseRecord & { receiptFile?: File } | undefined>('readonly', (store) => store.get(id))
}

function receiptKey(id: string, owner: string) {
  return `${owner}:${id}`
}

export async function saveLocalReceipt(id: string, owner: string, file: File) {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECEIPTS, 'readwrite')
    tx.objectStore(RECEIPTS).put({ id: receiptKey(id, owner), expenseId: id, owner, receiptFile: file })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not save this receipt on this device.'))
    tx.onabort = () => reject(tx.error ?? new Error('Receipt saving was interrupted.'))
  })
}

export async function openLocalReceipt(id: string, owner: string) {
  const db = await getDatabase()
  return new Promise<{ receiptFile: File } | undefined>((resolve, reject) => {
    const request = db.transaction(RECEIPTS, 'readonly').objectStore(RECEIPTS).get(receiptKey(id, owner))
    request.onsuccess = () => resolve(request.result?.receiptFile ? { receiptFile: request.result.receiptFile } : undefined)
    request.onerror = () => reject(request.error ?? new Error('Could not open the saved receipt.'))
  })
}

export async function deleteLocalReceipt(id: string, owner: string) {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECEIPTS, 'readwrite')
    tx.objectStore(RECEIPTS).delete(receiptKey(id, owner))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not remove the saved receipt.'))
    tx.onabort = () => reject(tx.error ?? new Error('Receipt removal was interrupted.'))
  })
}
