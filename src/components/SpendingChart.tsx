type SpendingChartProps = { expenses: Array<{ date: string; amount: number }> }

const formatMoney = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

export default function SpendingChart({ expenses }: SpendingChartProps) {
  const lastDay = new Date()
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(lastDay)
    date.setDate(lastDay.getDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)
    return {
      key,
      day: new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date),
      amount: expenses.filter((expense) => expense.date === key).reduce((sum, expense) => sum + expense.amount, 0),
    }
  })
  const max = Math.max(...daily.map((day) => day.amount), 1)
  const axisMax = Math.max(2000, Math.ceil(max / 2000) * 2000)
  return <div className="chart-wrap">
    <div className="chart-y-labels">{[4, 3, 2, 1, 0].map((tick) => <span key={tick}>{formatMoney(axisMax * tick / 4)}</span>)}</div>
    <div className="chart-main">
      <div className="chart-grid"><i /><i /><i /><i /><i /></div>
      <div className="bars">{daily.map((day, index) => <div className="bar-column" key={day.key}><div className={`bar ${index === 6 ? 'bar-highlight' : ''}`} style={{ height: `${Math.max(3, (day.amount / axisMax) * 100)}%` }}><span className="bar-tooltip">{formatMoney(day.amount)}</span></div><span className={index === 6 ? 'day-active' : ''}>{day.day}</span></div>)}</div>
    </div>
  </div>
}
