// ── Default categories ────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { id: 'housing',       name: 'Housing',        icon: '🏠', color: '#7c3aed', budget: 0, essential: true  },
  { id: 'food',          name: 'Food & Dining',   icon: '🍽️', color: '#f97316', budget: 0, essential: true  },
  { id: 'transport',     name: 'Transport',       icon: '🚌', color: '#0ea5e9', budget: 0, essential: true  },
  { id: 'health',        name: 'Health',          icon: '💊', color: '#10b981', budget: 0, essential: true  },
  { id: 'utilities',     name: 'Utilities',       icon: '⚡', color: '#f59e0b', budget: 0, essential: true  },
  { id: 'shopping',      name: 'Shopping',        icon: '🛍️', color: '#f43f5e', budget: 0, essential: false },
  { id: 'entertainment', name: 'Entertainment',   icon: '🎬', color: '#8b5cf6', budget: 0, essential: false },
  { id: 'subscriptions', name: 'Subscriptions',   icon: '📱', color: '#14b8a6', budget: 0, essential: false },
  { id: 'education',     name: 'Education',       icon: '📚', color: '#3b82f6', budget: 0, essential: false },
  { id: 'other',         name: 'Other',           icon: '📦', color: '#94a3b8', budget: 0, essential: false },
]

function defaultData() {
  return {
    profile: {
      name: '',
      currency: '£',
      salaryNet: 0,          // default/template salary (overrideable per month)
      location: 'London',
      gbpToEurRate: 1.17,    // live GBP → EUR rate for debt conversion
      updatedAt: null
    },
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    monthlyBudgets: [],      // array of saved monthly plan snapshots
    goals: [],
    loans: [],
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function fmtCurrency(amount, currency = '£') {
  const abs = Math.abs(amount)
  const formatted = abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(0)
  return `${amount < 0 ? '-' : ''}${currency}${formatted}`
}

function fmtCurrencyFull(amount, currency = '£') {
  return `${amount < 0 ? '-' : ''}${currency}${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

function monthLabelLong(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

// ── Monthly budget helpers ────────────────────────────────────────────────────

function getMonthBudget(data, monthKey) {
  return data.monthlyBudgets.find(b => b.month === monthKey) || null
}

function getOrCreateMonthBudget(data, monthKey) {
  const existing = getMonthBudget(data, monthKey)
  if (existing) return JSON.parse(JSON.stringify(existing))
  // Create draft from template categories
  const allocations = {}
  data.categories.forEach(c => { allocations[c.id] = c.budget })
  return {
    id: null,  // null = unsaved draft
    month: monthKey,
    income: data.profile.salaryNet || 0,
    notes: '',
    allocations,
    savedAt: null
  }
}

function calcMonthSummary(data, budget) {
  const catTotal  = Object.values(budget.allocations || {}).reduce((s, v) => s + (v || 0), 0)
  const goalTotal = data.goals.reduce((s, g) => s + (g.monthlyContribution || 0), 0)
  const debtTotal = data.loans.reduce((s, l) => s + loanMonthlyInProfileCurrency(data, l), 0)
  const totalCommitted = catTotal + goalTotal + debtTotal
  const remaining = budget.income - totalCommitted
  return { catTotal, goalTotal, debtTotal, totalCommitted, remaining }
}

// Convert a loan's monthly payment to profile currency
function loanMonthlyInProfileCurrency(data, loan) {
  const pay = loan.monthlyPayment || 0
  if (!pay) return 0
  const lCur  = loan.currency    || data.profile.currency
  const pCur  = data.profile.currency
  const rate  = data.profile.gbpToEurRate || 1
  if (lCur === pCur) return pay
  // loan in EUR, profile in GBP: how much GBP does the user need to send?
  if (lCur === '€' && pCur === '£') return pay / rate   // GBP needed to produce that EUR
  if (lCur === '£' && pCur === '€') return pay * rate
  return pay
}

// How much EUR is received when user sends X GBP (or vice versa)
function convertPayment(data, amount, fromCurrency, toCurrency) {
  const rate = data.profile.gbpToEurRate || 1
  if (fromCurrency === toCurrency) return amount
  if (fromCurrency === '£' && toCurrency === '€') return amount * rate
  if (fromCurrency === '€' && toCurrency === '£') return amount / rate
  return amount
}

// ── Financial Health Score (plan-based) ──────────────────────────────────────

function calcHealthScore(data) {
  const { profile, categories, goals, loans, monthlyBudgets } = data
  const salary = profile.salaryNet
  if (!salary) return { score: 0, breakdown: [] }

  const curBudget = getOrCreateMonthBudget(data, getCurrentMonthKey())
  const income    = curBudget.income || salary
  const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(data, curBudget)

  // 1. Savings / goal rate (0–30)
  const savingsRate = income > 0 ? goalTotal / income : 0
  const savingsPts  = Math.min(30, Math.round(savingsRate * 150))

  // 2. Budget coverage — is income fully planned? (0–25)
  const coveragePct = income > 0 ? totalCommitted / income : 0
  let coveragePts = 0
  if (coveragePct >= 0.85 && coveragePct <= 1.0) coveragePts = 25
  else if (coveragePct >= 0.7)  coveragePts = 18
  else if (coveragePct >= 0.5)  coveragePts = 10
  else if (totalCommitted > 0)  coveragePts = 5

  // 3. Debt burden — lower is better (0–20)
  const debtRate = income > 0 ? debtTotal / income : 0
  const debtPts  = debtTotal === 0 ? 20 : Math.max(0, Math.round(20 * (1 - debtRate * 2)))

  // 4. Setup completeness — has a saved plan, categories filled (0–25)
  const hasSaved  = monthlyBudgets.some(b => b.month === getCurrentMonthKey())
  const catFilled = categories.filter(c => (curBudget.allocations[c.id] || 0) > 0).length
  const setupPts  = Math.round((hasSaved ? 10 : 0) + Math.min(15, catFilled * 2))

  const score = Math.min(100, savingsPts + coveragePts + debtPts + setupPts)

  return {
    score,
    breakdown: [
      { label: 'Savings rate',     pts: savingsPts,  max: 30, color: '#10b981' },
      { label: 'Budget quality',   pts: coveragePts, max: 25, color: '#7c3aed' },
      { label: 'Debt burden',      pts: debtPts,     max: 20, color: '#f43f5e' },
      { label: 'Setup quality',    pts: setupPts,    max: 25, color: '#0ea5e9' },
    ]
  }
}

// ── Smart insights (plan-based) ───────────────────────────────────────────────

function generateInsights(data) {
  const insights = []
  const { profile, goals, loans, categories } = data
  const salary = profile.salaryNet
  const curBudget = getOrCreateMonthBudget(data, getCurrentMonthKey())
  const income = curBudget.income || salary
  const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(data, curBudget)

  if (!salary) {
    insights.push({ type: 'info', icon: '👋', text: 'Set your default salary in Budget Setup to get personalised insights.' })
    return insights
  }

  const debtPct  = income > 0 ? Math.round(debtTotal  / income * 100) : 0
  const goalPct  = income > 0 ? Math.round(goalTotal   / income * 100) : 0
  const catPct   = income > 0 ? Math.round(catTotal    / income * 100) : 0

  if (remaining < 0) {
    insights.push({ type: 'bad', icon: '🚨', text: `You're ${fmtCurrencyFull(Math.abs(remaining), profile.currency)} over your income this month — something needs to give!` })
  } else if (remaining < income * 0.05) {
    insights.push({ type: 'warn', icon: '😬', text: `Only ${fmtCurrencyFull(remaining, profile.currency)} unplanned — things are tight. Any surprise expense could throw you off.` })
  } else if (remaining > 0) {
    insights.push({ type: 'good', icon: '🎉', text: `${fmtCurrencyFull(remaining, profile.currency)} is unplanned — consider routing it to a goal or padding your savings!` })
  }

  if (debtPct > 25) {
    insights.push({ type: 'warn', icon: '📉', text: `Debt repayments are ${debtPct}% of your income. High, but you're chipping away at it 💪` })
  } else if (debtPct > 0) {
    insights.push({ type: 'info', icon: '📉', text: `${debtPct}% of income goes to debt repayment — that's manageable. Keep going!` })
  }

  if (goalPct >= 20) {
    insights.push({ type: 'good', icon: '🏆', text: `${goalPct}% going to goals — you're absolutely smashing it! Future you will be grateful.` })
  } else if (goalPct >= 10) {
    insights.push({ type: 'good', icon: '✨', text: `${goalPct}% going to savings goals. Solid! Aim for 20% if you can.` })
  } else if (goalPct > 0) {
    insights.push({ type: 'warn', icon: '🌱', text: `Only ${goalPct}% going to goals right now. Even small increases compound over time!` })
  }

  if (catPct > 80) {
    insights.push({ type: 'warn', icon: '💸', text: `Living expenses are ${catPct}% of income — leaves little room for saving.` })
  }

  const unfilledCats = categories.filter(c => !(curBudget.allocations[c.id] > 0))
  if (unfilledCats.length > 3) {
    insights.push({ type: 'info', icon: '📋', text: `${unfilledCats.length} categories aren't budgeted yet. Filling them in gives you a clearer picture.` })
  }

  if (loans.length === 0 && goals.length === 0 && !insights.length) {
    insights.push({ type: 'info', icon: '🚀', text: 'Add your goals and debt so your budget plan can show the full picture.' })
  }

  return insights.slice(0, 4)
}

// ── Rule-based allocation ─────────────────────────────────────────────────────

function applyAllocationRule(data, rule, income) {
  const loc = (data.profile.location || '').toLowerCase()
  const isUK = ['london','manchester','edinburgh','bristol','birmingham','dublin'].some(c => loc.includes(c))
  const isEU = ['paris','amsterdam','berlin'].some(c => loc.includes(c))

  const RULES = {
    '503020': isUK
      ? { housing:.37, food:.07, transport:.05, utilities:.00, health:.00, shopping:.06, entertainment:.05, subscriptions:.04, education:.03, other:.13 }
      : isEU
      ? { housing:.32, food:.08, transport:.05, utilities:.02, health:.02, shopping:.07, entertainment:.06, subscriptions:.04, education:.04, other:.10 }
      : { housing:.25, food:.10, transport:.05, utilities:.05, health:.05, shopping:.08, entertainment:.07, subscriptions:.05, education:.05, other:.05 },
    '702010': isUK
      ? { housing:.38, food:.08, transport:.06, utilities:.00, health:.00, shopping:.08, entertainment:.06, subscriptions:.04, education:.03, other:.07 }
      : { housing:.28, food:.12, transport:.08, utilities:.06, health:.06, shopping:.08, entertainment:.06, subscriptions:.04, education:.02, other:.00 },
    '601030': isUK
      ? { housing:.32, food:.07, transport:.05, utilities:.00, health:.00, shopping:.04, entertainment:.04, subscriptions:.03, education:.05, other:.10 }
      : { housing:.22, food:.10, transport:.07, utilities:.05, health:.06, shopping:.05, entertainment:.05, subscriptions:.03, education:.05, other:.02 },
  }
  const alloc = RULES[rule]
  if (!alloc) return
  data.categories.forEach(cat => {
    if (alloc[cat.id] !== undefined) cat.budget = Math.round(income * alloc[cat.id])
  })
}
