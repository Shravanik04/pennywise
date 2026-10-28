import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ReceiptItem = { id: string; name: string; price: number; category: string }
export type ReceiptDraft = {
  merchant: string
  date: string
  category: string
  subtotal: number | null
  tax: number | null
  total: number | null
  items: ReceiptItem[]
  warnings: string[]
  rawText: string
}
type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>

export const categories = ['Food & drink', 'Groceries', 'Personal Care', 'Transport', 'Shopping', 'Bills', 'Health', 'Subscriptions', 'Other', 'Mixed']
const categoryFor = (itemName: string, merchant: string) => {
  const item = itemName.toLowerCase()
  const shop = merchant.toLowerCase()
  if (/shampoo|soap|toothpaste|toothbrush|skincare|skin care|lotion|deodorant|hair oil|face ?wash|sanitary|razor|conditioner|body wash|cosmetic|moisturi[sz]er|detergent|dishwash|cleaner/.test(item)) return 'Personal Care'
  if (/milk|biscuit|cookie|rice|atta|flour|bread|fruit|vegetable|dal|pulses|egg|oil|grocery|cheese|yogurt|curd|snack|beverage|water/.test(item)) return 'Groceries'
  if (/medicine|pharmacy|vitamin|tablet|health|clinic/.test(item)) return 'Health'
  if (/uber|ola|rapido|metro|bus|taxi|fuel|petrol|parking/.test(`${item} ${shop}`)) return 'Transport'
  if (/netflix|spotify|prime video|subscription/.test(`${item} ${shop}`)) return 'Subscriptions'
  if (/restaurant|cafe|coffee|dining|food|pizza|burger|meal|lunch|dinner/.test(`${item} ${shop}`)) return 'Food & drink'
  if (/dmart|d-mart|bigbasket|blinkit|zepto|instamart|reliance fresh|more supermarket|supermarket|grocery/.test(shop)) return 'Groceries'
  if (/mall|apparel|fashion|electronics|retail|amazon|flipkart/.test(shop)) return 'Shopping'
  if (/electricity|water bill|internet|broadband|utility|gas bill/.test(item)) return 'Bills'
  return 'Other'
}
const parseAmount = (value: string) => {
  const normalized = value.replace(/[₹$€£,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.abs(parsed) : null
}
const itemId = () => crypto.randomUUID()

function extractFields(text: string): ReceiptDraft {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})\b/i)
  let date = ''
  if (dateMatch) {
    const raw = dateMatch[0]
    const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
    if (iso) date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    else if (parts) {
      const year = Number(parts[3]) < 100 ? `20${parts[3]}` : parts[3]
      date = `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    } else {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10)
    }
  }

  const amountPattern = /(?:₹|INR\s*)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\s*%)/gi
  const lineAmount = (line: string) => {
    const matches = [...line.matchAll(amountPattern)]
    const match = matches[matches.length - 1]
    return match ? parseAmount(match[1] ?? match[2] ?? '') : null
  }
  const totalLine = [...lines].reverse().find((line) => /\b(grand\s*total|amount\s*due|total\s*amount|net\s*payable|total|balance\s*due)\b/i.test(line) && !/sub.?total/i.test(line))
  const total = totalLine ? lineAmount(totalLine) : null
  const taxLine = lines.find((line) => /\b(gst|cgst|sgst|igst|tax|vat)\b/i.test(line) && !/gstin/i.test(line))
  const tax = taxLine ? lineAmount(taxLine) : null
  const subtotalLine = lines.find((line) => /\b(sub.?total|before tax)\b/i.test(line))
  const subtotal = subtotalLine ? lineAmount(subtotalLine) : null

  const excluded = /\b(total|subtotal|tax|gst|cgst|sgst|igst|vat|discount|change|cash|card|upi|invoice|receipt|date|time|phone|tel|address|thank|balance|round.?off|gstin|bill no|order no)\b/i
  const merchantLine = lines.find((line) => line.length > 2 && line.length < 75 && !/\d{5,}|@|https?:|\b(invoice|receipt|tax|gstin|date|time|phone|tel)\b/i.test(line) && !/^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/.test(line)) ?? ''
  const merchant = dateMatch ? merchantLine.replace(dateMatch[0], '').replace(/[|,\-–]+$/, '').trim() : merchantLine
  const rawItems = lines.flatMap((line) => {
    const match = line.match(/^(.{2,}?)\s+(?:₹\s*)?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2})?)\s*$/)
    if (!match || excluded.test(match[1]) || match[1].length > 55) return []
    const price = parseAmount(match[2])
    if (price === null || price <= 0) return []
    return [{ id: itemId(), name: match[1].replace(/^[*\-•\d.)\s]+/, '').trim(), price }]
  }).filter((item) => item.name.length > 1).slice(0, 30)
  const items = rawItems.map((item) => ({ ...item, category: categoryFor(item.name, merchant) }))
  const warnings: string[] = []
  if (!merchant) warnings.push('Merchant could not be identified—enter it manually.')
  if (!date) warnings.push('Date could not be identified—enter it manually.')
  if (total === null) warnings.push('Total could not be identified—enter it manually.')
  if (items.length === 0) warnings.push('No line items were confidently recognized. Add or correct items below.')
  if (tax === null) warnings.push('Tax was not detected. Check the receipt and enter tax if shown.')
  const itemCategories = [...new Set(items.map((item) => item.category))]
  const category = itemCategories.length === 1 ? itemCategories[0] : itemCategories.length > 1 ? 'Mixed' : categoryFor('', merchant)
  return { merchant, date, category, subtotal, tax, total, items, warnings, rawText: text }
}

async function fileToImages(file: File, onProgress: (message: string) => void): Promise<Array<{ image: string | HTMLCanvasElement; label: string }>> {
  if (file.type.startsWith('image/')) {
    return [{ image: URL.createObjectURL(file), label: file.name }]
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Unsupported file. Upload a JPG, PNG, WEBP, or PDF receipt.')
  }
  onProgress('Rendering PDF pages…')
  const pdfDocument = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  if (pdfDocument.numPages > 20) throw new Error('This PDF has more than 20 pages. Split it into smaller receipt files and try again.')
  const pages = pdfDocument.numPages
  const images: Array<{ image: HTMLCanvasElement; label: string }> = []
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: Math.min(2, 1600 / page.getViewport({ scale: 1 }).width) })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    images.push({ image: canvas, label: `${file.name} · page ${pageNumber}` })
  }
  return images
}

export async function scanReceipt(file: File, onProgress: (message: string) => void): Promise<ReceiptDraft> {
  if (file.size > 15 * 1024 * 1024) throw new Error('This file is larger than 15 MB. Choose a smaller receipt file.')
  const images = await fileToImages(file, onProgress)
  if (images.length === 0) throw new Error('This PDF does not contain any readable pages.')
  onProgress(`Reading ${images.length > 1 ? `${images.length} pages` : 'receipt text'} with OCR…`)
  let worker: TesseractWorker | undefined
  try {
    try {
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker('eng')
    } catch {
      throw new Error('The OCR engine could not start. Check your internet connection for the one-time English language-data download, then try again.')
    }
    let combinedText = ''
    for (let index = 0; index < images.length; index += 1) {
      onProgress(`Reading ${images[index].label} (${index + 1} of ${images.length})…`)
      let result
      try {
        result = await worker.recognize(images[index].image)
      } catch {
        throw new Error('OCR could not read this receipt. Try a clearer, well-lit image or another file format.')
      }
      combinedText += `\n${result.data.text}`
    }
    if (!combinedText.trim()) {
      return { merchant: '', date: '', category: 'Other', subtotal: null, tax: null, total: null, items: [], warnings: ['No readable text was found. Try a sharper, well-lit image or enter the receipt details manually.'], rawText: '' }
    }
    return extractFields(combinedText)
  } finally {
    await worker?.terminate()
    for (const entry of images) if (typeof entry.image === 'string') URL.revokeObjectURL(entry.image)
  }
}

