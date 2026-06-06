// ── Default data structure ────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { id: 'housing',       name: 'Housing',        icon: '🏠', color: '#6366f1', budget: 0, essential: true  },
  { id: 'food',          name: 'Food & Dining',   icon: '🍽️', color: '#f59e0b', budget: 0, essential: true  },
  { id: 'transport',     name: 'Transport',       icon: '🚌', color: '#3b82f6', budget: 0, essential: true  },
  { id: 'health',        name: 'Health',          icon: '💊', color: '#10b981', budget: 0, essential: true  },
  { id: 'utilities',     name: 'Utilities',       icon: '⚡', color: '#f97316', budget: 0, essential: true  },
  { id: 'shopping',      name: 'Shopping',        icon: '🛍️', color: '#ec4899', budget: 0, essential: false },
  { id: 'entertainment', name: 'Entertainment',   icon: '🎬', color: '#8b5cf6', budget: 0, essential: false },
  { id: 'subscriptions', name: 'Subscriptions',   icon: '📱', color: '#14b8a6', budget: 0, essential: false },
  { id: 'education',     name: 'Education',       icon: '📚', color: '#06b6d4', budget: 0, essential: false },
  { id: 'savings',       name: 'Savings',         icon: '🏦', color: '#10b981', budget: 0, essential: true  },
  { id: 'other',         name: 'Other',           icon: '📦', color: '#6b7280', budget: 0, essential: false },
]

function defaultData() {
  return {
    profile: { name: '', currency: '£', salaryNet: 0, location: 'London', updatedAt: null },
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    transactions: [],
    goals: [],
    loans: [],
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function fmtCurrency(amount, currency = '€') {
  const abs = Math.abs(amount)
  const formatted = abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(2)
  return `${amount < 0 ? '-' : ''}${currency}${formatted}`
}

function fmtCurrencyFull(amount, currency = '€') {
  return `${amount < 0 ? '-' : ''}${currency}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getMonthKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentMonthKey() {
  return getMonthKey(new Date())
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function monthLabelLong(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getLastNMonths(n) {
  const keys = []
  let key = getCurrentMonthKey()
  for (let i = 0; i < n; i++) {
    keys.unshift(key)
    key = addMonths(key, -1)
  }
  return keys
}

// ── Aggregations ─────────────────────────────────────────────────────────────

function getSpendingByMonth(transactions) {
  const map = {}
  transactions.forEach(t => {
    if (t.type !== 'expense') return
    const key = getMonthKey(t.date)
    map[key] = (map[key] || 0) + t.amount
  })
  return map
}

function getSpendingByCategory(transactions, monthKey) {
  const map = {}
  transactions.forEach(t => {
    if (t.type !== 'expense') return
    if (monthKey && getMonthKey(t.date) !== monthKey) return
    map[t.category] = (map[t.category] || 0) + t.amount
  })
  return map
}

function getMonthlyByCategory(transactions) {
  const map = {}
  transactions.forEach(t => {
    if (t.type !== 'expense') return
    const key = getMonthKey(t.date)
    if (!map[key]) map[key] = {}
    map[key][t.category] = (map[key][t.category] || 0) + t.amount
  })
  return map
}

// ── Financial Health Score (0–100) ──────────────────────────────────────────

function calcHealthScore(data) {
  const { profile, categories, transactions } = data
  const salary = profile.salaryNet
  if (!salary) return { score: 0, breakdown: [] }

  const currentMonth = getCurrentMonthKey()
  const lastMonths = getLastNMonths(3).slice(0, -1)
  const spendingByMonth = getSpendingByMonth(transactions)

  const recentSpending = lastMonths.reduce((s, k) => s + (spendingByMonth[k] || 0), 0)
  const avgMonthlySpend = lastMonths.length ? recentSpending / lastMonths.length : 0

  const totalBudget = categories.reduce((s, c) => s + c.budget, 0)
  const savingsCat = categories.find(c => c.id === 'savings')
  const savingsBudget = savingsCat ? savingsCat.budget : 0
  const savingsRate = salary ? savingsBudget / salary : 0

  // Component 1: Savings rate (0–30 pts)
  const savingsPts = Math.min(30, Math.round(savingsRate * 100))

  // Component 2: Budget adherence (0–25 pts) — how close to budget are we?
  let adherencePts = 25
  if (avgMonthlySpend > 0 && totalBudget > 0) {
    const ratio = avgMonthlySpend / totalBudget
    if (ratio <= 1.0) adherencePts = Math.round(25 * (1 - Math.max(0, ratio - 0.8) / 0.2))
    else adherencePts = Math.max(0, Math.round(25 * (1 - (ratio - 1) * 2)))
  }

  // Component 3: Essential vs discretionary ratio (0–20 pts)
  const spendingByCat = getSpendingByCategory(transactions, currentMonth)
  const essentialIds = categories.filter(c => c.essential).map(c => c.id)
  const totalSpent = Object.values(spendingByCat).reduce((a, b) => a + b, 0)
  const essentialSpent = essentialIds.reduce((s, id) => s + (spendingByCat[id] || 0), 0)
  const essentialRatio = totalSpent > 0 ? essentialSpent / totalSpent : 1
  const ratioPts = Math.round(20 * Math.min(1, essentialRatio + 0.1))

  // Component 4: Budget setup completeness (0–25 pts)
  const setupPts = totalBudget > 0 && salary > 0 ? Math.min(25, Math.round(25 * Math.min(1, totalBudget / salary))) : 0

  const score = Math.min(100, savingsPts + adherencePts + ratioPts + setupPts)

  return {
    score,
    breakdown: [
      { label: 'Savings rate',     pts: savingsPts,   max: 30, color: '#10b981' },
      { label: 'Budget adherence', pts: adherencePts, max: 25, color: '#6366f1' },
      { label: 'Spending balance', pts: ratioPts,     max: 20, color: '#f59e0b' },
      { label: 'Setup quality',    pts: setupPts,     max: 25, color: '#3b82f6' },
    ]
  }
}

// ── Forecast algorithm ───────────────────────────────────────────────────────

function forecastSpending(data, horizonMonths = 3) {
  const { transactions, categories } = data
  const monthly = getMonthlyByCategory(transactions)
  const allMonths = Object.keys(monthly).sort()
  const recentMonths = allMonths.slice(-6)

  const result = {}
  categories.forEach(cat => {
    if (cat.id === 'savings') return
    const vals = recentMonths.map(m => monthly[m]?.[cat.id] || 0)
    if (vals.every(v => v === 0)) { result[cat.id] = { avg: 0, forecast: Array(horizonMonths).fill(0), trend: 0 }; return }

    const n = vals.length
    const weights = vals.map((_, i) => i + 1)
    const totalW = weights.reduce((a, b) => a + b, 0)
    const wma = vals.reduce((s, v, i) => s + v * weights[i], 0) / totalW

    const xMean = (n - 1) / 2
    const yMean = vals.reduce((a, b) => a + b, 0) / n
    const num = vals.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0)
    const den = vals.reduce((s, _, i) => s + Math.pow(i - xMean, 2), 0) || 1
    const slope = num / den

    result[cat.id] = {
      avg: wma,
      history: vals,
      historyMonths: recentMonths,
      trend: slope,
      forecast: Array.from({ length: horizonMonths }, (_, i) => Math.max(0, wma + slope * (i + 1)))
    }
  })
  return result
}

// ── Smart insights ───────────────────────────────────────────────────────────

function generateInsights(data) {
  const { transactions, categories, profile } = data
  const insights = []
  const cur = getCurrentMonthKey()
  const prev = addMonths(cur, -1)
  const salary = profile.salaryNet

  const spendCur = getSpendingByCategory(transactions, cur)
  const spendPrev = getSpendingByCategory(transactions, prev)
  const totalCur = Object.values(spendCur).reduce((a, b) => a + b, 0)

  categories.forEach(cat => {
    const curAmt = spendCur[cat.id] || 0
    const prevAmt = spendPrev[cat.id] || 0
    const budget = cat.budget

    if (budget > 0 && curAmt > budget * 1.1) {
      insights.push({ type: 'bad', icon: '⚠️', text: `${cat.name} is ${fmtCurrency(curAmt - budget)} over budget this month.` })
    } else if (budget > 0 && curAmt <= budget * 0.5 && curAmt > 0) {
      insights.push({ type: 'good', icon: '✅', text: `Great job on ${cat.name}! You've only used ${Math.round(curAmt/budget*100)}% of your budget.` })
    }

    if (prevAmt > 0 && curAmt > prevAmt * 1.3) {
      insights.push({ type: 'warn', icon: '📈', text: `${cat.name} spending is up ${Math.round((curAmt/prevAmt-1)*100)}% compared to last month.` })
    }
  })

  if (salary > 0) {
    const savingsTarget = categories.find(c => c.id === 'savings')?.budget || 0
    const remaining = salary - totalCur
    if (remaining > savingsTarget && savingsTarget > 0) {
      insights.push({ type: 'good', icon: '💰', text: `You're on track to save ${fmtCurrency(remaining)} this month — ${fmtCurrency(remaining - savingsTarget)} above your savings goal!` })
    } else if (remaining < 0) {
      insights.push({ type: 'bad', icon: '🚨', text: `You've exceeded your monthly income by ${fmtCurrency(Math.abs(remaining))} this month.` })
    }
  }

  if (insights.length === 0) {
    insights.push({ type: 'info', icon: '📊', text: 'Add more transactions to get personalized spending insights.' })
  }

  return insights.slice(0, 4)
}
