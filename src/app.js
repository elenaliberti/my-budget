// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ['£','€','$','¥','₹','Fr','kr','A$','C$','CHF','zł','R$']

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  view: 'dashboard',
  data: defaultData(),
  viewMonth: getCurrentMonthKey(),      // dashboard month navigation
  txFilter: { search: '', category: 'all', month: getCurrentMonthKey() },
  simAdjust: {},
  _forecastChartData: null,
}

async function saveData() { await window.budget.save(state.data) }

// ── Currency helpers ──────────────────────────────────────────────────────────

function txCur(tx)   { return tx?.currency   || state.data.profile.currency }
function loanCur(l)  { return l?.currency    || state.data.profile.currency }
function goalCur(g)  { return g?.currency    || state.data.profile.currency }
function profCur()   { return state.data.profile.currency }

function c(amount, currency) { return fmtCurrencyFull(amount, currency || profCur()) }
function cs(amount, currency) { return fmtCurrency(amount, currency || profCur()) }

// Group transaction totals by currency (for mixed-currency display)
function totalsByCurrency(transactions, monthKey) {
  const totals = {}
  transactions.forEach(t => {
    if (t.type !== 'expense') return
    if (monthKey && getMonthKey(t.date) !== monthKey) return
    const cur = txCur(t)
    totals[cur] = (totals[cur] || 0) + t.amount
  })
  return totals
}

function formatMixedTotal(totals) {
  return Object.entries(totals).map(([cur, amt]) => c(amt, cur)).join(' + ') || c(0)
}

function primaryTotal(totals) {
  return totals[profCur()] || 0
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(view) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view))
  state.view = view
  state.simAdjust = {}
  render()
}

// ── Main render ───────────────────────────────────────────────────────────────

function render() {
  const container = document.getElementById('view-container')
  const hasSalary = state.data.profile.salaryNet > 0

  updateSidebar()

  if (!hasSalary && state.view !== 'budget') {
    container.innerHTML = renderSetupPrompt()
    container.querySelector('#go-setup-btn')?.addEventListener('click', () => navigate('budget'))
    return
  }

  switch (state.view) {
    case 'dashboard':    container.innerHTML = renderDashboard();    break
    case 'budget':       container.innerHTML = renderBudget();       break
    case 'transactions': container.innerHTML = renderTransactions(); break
    case 'forecast':     container.innerHTML = renderForecast();     break
    case 'goals':        container.innerHTML = renderGoals();        break
    case 'loans':        container.innerHTML = renderLoans();        break
  }
  attachDynamicListeners()
}

function updateSidebar() {
  const { profile } = state.data
  document.getElementById('sidebar-salary').textContent =
    profile.salaryNet > 0 ? c(profile.salaryNet, profCur()) : '—'
  const { score } = calcHealthScore(state.data)
  document.getElementById('sidebar-score').textContent = score ? `${score}/100` : '—'
  const miniCanvas = document.getElementById('health-mini-ring')
  if (score) drawRing(miniCanvas, score / 100, '#10b981', { lineWidth: 4, padding: 3 })
}

// ── Setup Prompt ──────────────────────────────────────────────────────────────

function renderSetupPrompt() {
  return `
    <div class="setup-prompt">
      <div class="sp-icon">💸</div>
      <div class="sp-title">Let's set up your budget</div>
      <div class="sp-sub">Enter your monthly take-home salary and we'll help you allocate it smartly across all spending categories — with predictions and insights every month.</div>
      <button id="go-setup-btn" class="btn btn-primary" style="font-size:15px;padding:12px 32px;">Get Started →</button>
    </div>`
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() {
  const { profile, categories, transactions } = state.data
  const cur = state.viewMonth
  const prev = addMonths(cur, -1)
  const isCurrentMonth = cur === getCurrentMonthKey()
  const salary = profile.salaryNet

  const totCur = totalsByCurrency(transactions, cur)
  const totPrev = totalsByCurrency(transactions, prev)
  const totalCur = Object.values(totCur).reduce((a, b) => a + b, 0)
  const totalPrevPrimary = primaryTotal(totPrev)
  const remaining = salary - primaryTotal(totCur)
  const isMixed = Object.keys(totCur).length > 1

  const savingsCat = categories.find(c => c.id === 'savings')
  const savingsRate = savingsCat?.budget > 0 ? Math.round((savingsCat.budget / salary) * 100) : 0
  const { score, breakdown } = calcHealthScore(state.data)
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
  const gradeLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work'

  const spendDelta = totalPrevPrimary > 0
    ? ((primaryTotal(totCur) - totalPrevPrimary) / totalPrevPrimary * 100).toFixed(1) : null
  const recentTx = [...transactions]
    .filter(t => getMonthKey(t.date) === cur)
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7)
  const spendCur = getSpendingByCategory(transactions, cur)
  const catSpendsWithBudget = categories
    .filter(c => c.id !== 'savings' && (spendCur[c.id] || c.budget))
    .map(c => ({ ...c, spent: spendCur[c.id] || 0 }))
    .sort((a, b) => b.spent - a.spent).slice(0, 6)

  const insights = isCurrentMonth ? generateInsights(state.data) : []
  const last6 = getLastNMonths(6)
  const spendByMonth = getSpendingByMonth(transactions)
  const totalBudget = categories.filter(c => c.id !== 'savings').reduce((s, c) => s + c.budget, 0)

  // Monthly history (last 12 months for history table)
  const histMonths = getLastNMonths(12).reverse()

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title" style="display:flex;align-items:center;gap:12px;">
            Dashboard
            <div class="month-nav">
              <button class="month-nav-btn" id="dash-prev-month">←</button>
              <span class="month-nav-label">${monthLabelLong(cur)}</span>
              <button class="month-nav-btn" id="dash-next-month" ${isCurrentMonth ? 'disabled' : ''}>→</button>
              ${!isCurrentMonth ? `<button class="month-nav-today" id="dash-today">Today</button>` : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="add-tx-btn-dash">+ Add Transaction</button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon">💼</div>
        <div class="stat-val">${cs(salary, profCur())}</div>
        <div class="stat-lbl">Monthly Income</div>
        <div class="stat-delta neu">Net take-home</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💳</div>
        <div class="stat-val ${primaryTotal(totCur) > salary ? 'text-red' : ''}">${isMixed ? formatMixedTotal(totCur) : cs(primaryTotal(totCur), profCur())}</div>
        <div class="stat-lbl">Spent${!isCurrentMonth ? ' ('+monthLabel(cur)+')' : ' This Month'}</div>
        <div class="stat-delta ${spendDelta === null ? 'neu' : primaryTotal(totCur) > totalPrevPrimary ? 'neg' : 'pos'}">
          ${spendDelta !== null ? (primaryTotal(totCur) > totalPrevPrimary ? '↑' : '↓') + Math.abs(spendDelta) + '% vs prior month' : 'No prior data'}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${remaining >= 0 ? '✅' : '🚨'}</div>
        <div class="stat-val ${remaining < 0 ? 'text-red' : 'text-emerald'}">${cs(Math.abs(remaining), profCur())}</div>
        <div class="stat-lbl">${remaining >= 0 ? 'Remaining' : 'Over Budget'}</div>
        <div class="stat-delta ${remaining >= 0 ? 'pos' : 'neg'}">${remaining >= 0 ? Math.round((remaining/salary)*100) + '% of income' : 'Exceeded income'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🏦</div>
        <div class="stat-val text-emerald">${savingsRate}%</div>
        <div class="stat-lbl">Savings Rate</div>
        <div class="stat-delta ${savingsRate >= 20 ? 'pos' : savingsRate >= 10 ? 'neu' : 'neg'}">
          ${savingsRate >= 20 ? '🎯 On track' : savingsRate >= 10 ? 'Room to improve' : 'Below recommended'}
        </div>
      </div>
    </div>

    <div class="grid-col-7-5 mb20">
      <div class="card">
        <div class="card-title">Monthly Spending vs Budget — Last 6 Months</div>
        <canvas id="bar-chart" class="chart" style="width:100%;height:200px;"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Financial Health Score</div>
        <div class="health-score-wrap">
          <div class="health-score-ring">
            <canvas id="health-ring" style="width:96px;height:96px;"></canvas>
          </div>
          <div class="health-score-info">
            <div class="hs-score" style="color:${score>=80?'#10b981':score>=60?'#3b82f6':score>=40?'#f59e0b':'#ef4444'}">${score}</div>
            <div class="hs-label">out of 100</div>
            <div class="hs-grade grade-${grade}">${gradeLabel}</div>
          </div>
        </div>
        <div class="health-breakdown">
          ${breakdown.map(b => `
            <div class="hb-item">
              <div class="hb-label">${b.label}</div>
              <div class="hb-bar-track"><div class="hb-bar-fill" style="width:${(b.pts/b.max)*100}%;background:${b.color}"></div></div>
              <div class="hb-pts">${b.pts}/${b.max}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid-col-5-7 mb20">
      <div class="card">
        <div class="card-title">Spending by Category — ${monthLabel(cur)}</div>
        <canvas id="donut-chart" style="width:160px;height:160px;display:block;margin:8px auto;"></canvas>
        <div class="cat-spend-list">
          ${catSpendsWithBudget.map(c => {
            const pct = c.budget > 0 ? Math.min(100, Math.round(c.spent / c.budget * 100)) : 0
            const over = c.budget > 0 && c.spent > c.budget
            return `
              <div class="csl-item">
                <div class="csl-icon">${c.icon}</div>
                <div class="csl-info">
                  <div class="csl-name">${c.name}</div>
                  <div class="csl-bar-track"><div class="csl-bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
                </div>
                <div class="csl-amounts">
                  <div class="csl-spent ${over?'csl-over':''}">${cs(c.spent, profCur())}</div>
                  <div class="csl-budget">/ ${cs(c.budget, profCur())}</div>
                </div>
              </div>`
          }).join('')}
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:16px;">
        ${insights.length ? `
        <div>
          <div class="card-title">Smart Insights</div>
          <div class="insight-list">
            ${insights.map(i => `<div class="insight-item ${i.type}"><span class="insight-icon">${i.icon}</span><span>${i.text}</span></div>`).join('')}
          </div>
        </div>` : ''}
        <div>
          <div class="card-title">Transactions — ${monthLabel(cur)}</div>
          <div class="tx-list">
            ${recentTx.length ? recentTx.map(t => {
              const cat = state.data.categories.find(c => c.id === t.category) || {icon:'📦',color:'#6b7280',name:t.category}
              return `
                <div class="tx-item">
                  <div class="tx-icon-wrap" style="background:${cat.color}22;">${cat.icon}</div>
                  <div class="tx-info">
                    <div class="tx-desc">${t.description || cat.name}</div>
                    <div class="tx-meta">${cat.name} · ${new Date(t.date).toLocaleDateString('en-GB',{month:'short',day:'numeric'})}</div>
                  </div>
                  <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${cs(t.amount, txCur(t))}</div>
                </div>`
            }).join('') : `<div class="empty-state" style="padding:20px"><div class="empty-icon">💳</div><div class="empty-sub">No transactions for ${monthLabel(cur)}</div></div>`}
          </div>
        </div>
      </div>
    </div>

    <div class="card mb20">
      <div class="card-title" style="margin-bottom:14px;">📅 Monthly History</div>
      <div style="overflow-x:auto;">
        <table class="history-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Spent</th>
              <th>Budget</th>
              <th>vs Budget</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            ${histMonths.map(m => {
              const mTotals = totalsByCurrency(transactions, m)
              const mSpent = primaryTotal(mTotals)
              const mMixed = Object.keys(mTotals).length > 1
              const mTxCount = transactions.filter(t => t.type==='expense' && getMonthKey(t.date)===m).length
              const diff = mSpent - totalBudget
              const isCur2 = m === cur
              return `
                <tr class="${isCur2?'history-row-active':''}" style="cursor:pointer;" data-history-month="${m}">
                  <td><strong>${monthLabelLong(m)}</strong>${m===getCurrentMonthKey()?' <span class="badge-now">now</span>':''}</td>
                  <td>${mMixed ? formatMixedTotal(mTotals) : cs(mSpent, profCur())}</td>
                  <td>${cs(totalBudget, profCur())}</td>
                  <td class="${diff<=0?'text-emerald':'text-red'}">${diff<=0?'✓ '+cs(Math.abs(diff),profCur())+' under':'⚠ '+cs(diff,profCur())+' over'}</td>
                  <td class="text-muted">${mTxCount} tx</td>
                </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`
}

// ── Budget Setup ──────────────────────────────────────────────────────────────

function renderBudget() {
  const { profile, categories } = state.data
  const salary = profile.salaryNet
  const location = profile.location || ''
  const totalAllocated = categories.reduce((s, c) => s + c.budget, 0)
  const remaining = salary - totalAllocated
  const pct = salary > 0 ? Math.min(100, Math.round((totalAllocated/salary)*100)) : 0
  const over = totalAllocated > salary

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">Budget Setup</div>
          <div class="page-sub" style="display:flex;align-items:center;gap:8px;">
            Define how your monthly income is allocated
            ${location ? `<span class="location-badge" id="location-badge-btn">📍 ${location}</span>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="salary-hero">
      <div class="sh-left">
        <div class="sh-label">Monthly Net Salary</div>
        <div class="sh-amount">${salary > 0 ? c(salary, profCur()) : '—'}</div>
        <div class="sh-sub">Take-home pay after taxes &amp; deductions</div>
        <div class="allocation-summary" style="margin-top:14px;">
          <div class="alloc-pill allocated">Allocated: ${cs(totalAllocated, profCur())}</div>
          <div class="alloc-pill ${over?'over':'remaining'}">${over?'Over by: '+cs(totalAllocated-salary,profCur()):'Free: '+cs(remaining,profCur())}</div>
        </div>
      </div>
      <div class="sh-right">
        <button class="sh-btn sh-btn-primary" id="edit-salary-btn">✏️ Edit Salary</button>
        <button class="sh-btn sh-btn-secondary" id="set-currency-btn">🌍 ${profCur()} Currency</button>
      </div>
    </div>

    <div class="budget-progress-bar mb20">
      <div class="budget-progress-fill ${over?'over':pct>90?'near':''}" style="width:${pct}%"></div>
    </div>

    <div class="rule-wizard mb20">
      <div class="rw-text">
        <strong>Smart Allocation Wizard</strong>${location?` — Tuned for <em>${location}</em>`:''} — pick a rule:
      </div>
      <div class="rw-btns">
        <button class="rw-btn" data-rule="503020">50/30/20</button>
        <button class="rw-btn" data-rule="702010">70/20/10</button>
        <button class="rw-btn" data-rule="601030">60/10/30</button>
      </div>
    </div>

    <div class="page-header-row mb12">
      <div class="card-title" style="font-size:13px;margin-bottom:0;">Category Budgets</div>
      <button class="btn btn-secondary btn-sm" id="add-cat-btn">+ Add Category</button>
    </div>
    <div class="cat-budget-grid">
      ${categories.map(cat => {
        const pctOfSalary = salary > 0 && cat.budget > 0 ? Math.round((cat.budget/salary)*100) : 0
        return `
          <div class="cat-budget-row">
            <div class="cbr-icon" style="cursor:pointer;" data-edit-cat="${cat.id}">${cat.icon}</div>
            <div class="cbr-info">
              <div class="cbr-name" style="cursor:pointer;" data-edit-cat="${cat.id}">${cat.name}</div>
              <div class="cbr-pct">${pctOfSalary>0?`<span>${pctOfSalary}%</span> of income`:'Not allocated'}</div>
            </div>
            ${cat.essential ? '<div class="cbr-essential">Essential</div>' : ''}
            <button class="cbr-edit-btn" data-edit-cat="${cat.id}" title="Edit">✏️</button>
            <button class="cbr-del-btn" data-del-cat="${cat.id}" title="Delete">🗑️</button>
            <div class="cbr-input-wrap">
              <div class="cbr-currency">${profCur()}</div>
              <input type="number" class="cbr-input" data-cat="${cat.id}" value="${cat.budget||''}" placeholder="0" min="0" step="10">
            </div>
          </div>`
      }).join('')}
      <button class="add-cat-btn" id="add-cat-btn-2">＋ Add new category</button>
    </div>`
}

// ── Transactions ──────────────────────────────────────────────────────────────

function renderTransactions() {
  const { categories, transactions } = state.data
  const { search, category, month } = state.txFilter

  let filtered = transactions.filter(t => {
    if (category !== 'all' && t.category !== category) return false
    if (month !== 'all' && getMonthKey(t.date) !== month) return false
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => new Date(b.date) - new Date(a.date))

  const allMonths = [...new Set(transactions.map(t => getMonthKey(t.date)))].sort().reverse()
  const monthTxCount = month !== 'all' ? transactions.filter(t => getMonthKey(t.date) === month).length : 0

  const grouped = {}
  filtered.forEach(t => {
    const key = getMonthKey(t.date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  })

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">Transactions</div>
          <div class="page-sub">${filtered.length} shown</div>
        </div>
        ${month !== 'all' ? `<button class="btn btn-danger btn-sm" id="reset-month-btn">🗑 Reset ${monthLabel(month)}</button>` : ''}
      </div>
    </div>

    <div class="quick-add">
      <div class="qa-title">Quick Add</div>
      <div class="qa-fields">
        <div class="qa-field">
          <div class="qa-label">Description</div>
          <input class="qa-input" id="qa-desc" type="text" placeholder="e.g. Coffee, Rent…">
        </div>
        <div class="qa-field">
          <div class="qa-label">Amount</div>
          <div style="display:flex;gap:4px;">
            <select class="qa-input" id="qa-currency" style="width:64px;flex-shrink:0;padding:8px 4px;">
              ${CURRENCIES.map(cur => `<option value="${cur}" ${cur===profCur()?'selected':''}>${cur}</option>`).join('')}
            </select>
            <input class="qa-input" id="qa-amount" type="number" placeholder="0.00" min="0" step="0.01" style="flex:1;">
          </div>
        </div>
        <div class="qa-field">
          <div class="qa-label">Category</div>
          <select class="qa-input" id="qa-cat">
            ${categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="qa-field">
          <div class="qa-label">Date</div>
          <input class="qa-input" id="qa-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="qa-field">
          <div class="qa-label">Type</div>
          <select class="qa-input" id="qa-type">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <button class="qa-submit" id="qa-submit">Add +</button>
      </div>
    </div>

    <div class="tx-controls">
      <input class="tx-search" id="tx-search" type="text" placeholder="Search transactions…" value="${search}">
      <select class="filter-sel" id="tx-cat-filter">
        <option value="all">All categories</option>
        ${categories.map(c => `<option value="${c.id}" ${category===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
      <select class="filter-sel" id="tx-month-filter">
        <option value="all" ${month==='all'?'selected':''}>All months</option>
        ${allMonths.map(m => `<option value="${m}" ${month===m?'selected':''}>${monthLabelLong(m)}</option>`).join('')}
      </select>
    </div>

    ${Object.keys(grouped).length ? `
      <div class="tx-full-list">
        ${Object.keys(grouped).sort().reverse().map(m => {
          const monthTotals = totalsByCurrency(grouped[m], null)
          const expenseTotals = {}
          grouped[m].filter(t=>t.type==='expense').forEach(t => {
            const cur = txCur(t)
            expenseTotals[cur] = (expenseTotals[cur]||0) + t.amount
          })
          const totalStr = Object.entries(expenseTotals).map(([cur,amt])=>'-'+c(amt,cur)).join(' ')
          return `
            <div class="tx-month-group">
              <span>${monthLabelLong(m)}</span>
              <span class="tx-month-total">${totalStr || c(0, profCur())}</span>
            </div>
            ${grouped[m].map(t => {
              const cat = categories.find(c=>c.id===t.category)||{icon:'📦',color:'#6b7280',name:t.category}
              const isForeign = txCur(t) !== profCur()
              return `
                <div class="tx-full-item">
                  <div class="tx-date-badge">${new Date(t.date).toLocaleDateString('en-GB',{month:'short',day:'numeric'})}</div>
                  <div class="tx-icon-wrap" style="background:${cat.color}22;">${cat.icon}</div>
                  <div class="tx-info">
                    <div class="tx-desc">${t.description||cat.name}</div>
                    <div class="tx-meta">${cat.name}${isForeign?' · <span class="cur-badge">' + txCur(t) + '</span>':''}</div>
                  </div>
                  <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${c(t.amount, txCur(t))}</div>
                  <div class="tx-actions">
                    <button class="tx-icon-btn del" data-tx-del="${t.id}">🗑️</button>
                  </div>
                </div>`
            }).join('')}`
        }).join('')}
      </div>` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <div class="empty-title">No transactions found</div>
        <div class="empty-sub">Add your first transaction using the quick form above.</div>
      </div>`}
  `
}

// ── Forecast ──────────────────────────────────────────────────────────────────

function renderForecast() {
  const { profile, categories, transactions } = state.data
  const salary = profile.salaryNet
  const forecasts = forecastSpending(state.data, 3)
  const cur = getCurrentMonthKey()
  const forecastMonths = [addMonths(cur,1), addMonths(cur,2), addMonths(cur,3)]
  const fTotals = forecastMonths.map((_,i) => Object.values(forecasts).reduce((s,f) => s+(f.forecast[i]||0), 0))
  const last6 = getLastNMonths(6)
  const spendByMonth = getSpendingByMonth(transactions)
  const last6Actual = last6.map(m => spendByMonth[m] || null)
  const activeCats = categories.filter(c => c.id !== 'savings' && forecasts[c.id]?.avg > 0)
  const simAdjusted = activeCats.map(c => {
    const adj = state.simAdjust[c.id] !== undefined ? state.simAdjust[c.id] : 0
    const baseAvg = forecasts[c.id]?.avg || 0
    return { ...c, baseAvg, adjusted: Math.max(0, baseAvg * (1 + adj / 100)), adj }
  })
  const simTotal = simAdjusted.reduce((s,c) => s+c.adjusted, 0)
  const simSavings = salary - simTotal
  const baseTotal = simAdjusted.reduce((s,c) => s+c.baseAvg, 0)
  const chartLabels = [...last6, ...forecastMonths].map(m => monthLabel(m))
  const lastActual = last6Actual.filter(v=>v!=null).slice(-1)[0] || 0
  const chartActualData = [...last6Actual, null, null, null]
  const chartForecastData = [...last6Actual.slice(0,-1), lastActual, ...fTotals]
  state._forecastChartData = { chartLabels, chartActualData, chartForecastData, forecastStart: last6.length - 1 }

  return `
    <div class="page-header">
      <div class="page-title">Forecast & Simulation</div>
      <div class="page-sub">Spending predictions based on your historical patterns</div>
    </div>
    <div class="forecast-hero mb20">
      <div class="fh-label">Projected Next 3 Months</div>
      <div class="fh-title">~${cs(fTotals[0], profCur())}/month based on your trends</div>
      <div class="fh-sub">Weighted moving average over last ${last6.filter(m=>spendByMonth[m]).length} months of data</div>
      <div class="fh-months">
        ${forecastMonths.map((m,i) => {
          const prev = i===0?(spendByMonth[last6[last6.length-1]]||0):fTotals[i-1]
          const delta = prev>0?((fTotals[i]-prev)/prev*100).toFixed(1):0
          return `<div class="fhmc"><div class="fhmc-label">${monthLabel(m)}</div><div class="fhmc-amount">${cs(fTotals[i],profCur())}</div><div class="fhmc-delta ${fTotals[i]>prev?'up':'down'}">${Number(delta)>0?'↑':'↓'} ${Math.abs(delta)}%</div></div>`
        }).join('')}
      </div>
    </div>
    <div class="card mb20">
      <div class="card-title">6-Month History + 3-Month Forecast</div>
      <canvas id="forecast-line-chart" class="chart" style="width:100%;height:220px;"></canvas>
    </div>
    <div class="grid-2 mb20">
      <div class="card">
        <div class="card-title">Category Forecast Breakdown</div>
        <table class="forecast-cat-table">
          <thead><tr><th>Category</th><th>Avg/mo</th><th>Next Month</th><th>Trend</th></tr></thead>
          <tbody>
            ${activeCats.map(c => {
              const f = forecasts[c.id]
              const tSym = Math.abs(f.trend)<5?'→':f.trend>0?'↑':'↓'
              const tCls = Math.abs(f.trend)<5?'trend-stable':f.trend>0?'trend-up':'trend-down'
              return `<tr><td>${c.icon} ${c.name}</td><td>${cs(f.avg,profCur())}</td><td>${cs(f.forecast[0],profCur())}</td><td class="${tCls}">${tSym} ${Math.abs(f.trend).toFixed(0)}/mo</td></tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="scenario-sim">
        <div class="sim-label">⚗️ Scenario Simulator</div>
        <div class="sim-sliders">
          ${simAdjusted.slice(0,6).map(c => `
            <div class="sim-row">
              <div class="sim-cat-name">${c.icon} ${c.name}</div>
              <input type="range" class="sim-slider" data-sim-cat="${c.id}" min="-80" max="80" value="${c.adj}" step="5">
              <div class="sim-val">${cs(c.adjusted,profCur())}</div>
              <div class="sim-delta ${c.adj>0?'text-red':c.adj<0?'text-emerald':'text-muted'}">${c.adj!==0?(c.adj>0?'+':'')+c.adj+'%':'±0%'}</div>
            </div>`).join('')}
        </div>
        <div class="sim-result">
          <div>
            <div class="sr-label">Projected monthly savings after adjustments</div>
            <div class="fz12 text-muted">vs ${cs(salary-baseTotal,profCur())} without adjustments</div>
          </div>
          <div class="sr-amount ${simSavings>=0?'good':'bad'}">${c(simSavings,profCur())}</div>
        </div>
      </div>
    </div>`
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function renderGoals() {
  const { goals } = state.data
  return `
    <div class="page-header">
      <div class="page-header-row">
        <div><div class="page-title">Savings Goals</div><div class="page-sub">${goals.length} active</div></div>
        <button class="btn btn-primary btn-sm" id="add-goal-btn">+ New Goal</button>
      </div>
    </div>
    <div class="goals-grid">
      ${goals.map(g => {
        const cur = goalCur(g)
        const pct = g.target > 0 ? Math.min(1, g.current/g.target) : 0
        const remaining = g.target - g.current
        const monthsLeft = g.monthlyContribution > 0 && remaining > 0 ? Math.ceil(remaining/g.monthlyContribution) : null
        return `
          <div class="goal-card">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${g.color||'#10b981'};border-radius:16px 16px 0 0;"></div>
            <div style="text-align:center;font-size:26px;margin-bottom:6px;">${g.icon||'🎯'}</div>
            <div class="goal-name">${g.name}</div>
            ${cur !== profCur() ? `<div style="text-align:center;margin-bottom:4px;"><span class="cur-badge">${cur}</span></div>` : ''}
            <div class="goal-amounts"><strong>${c(g.current,cur)}</strong> of ${c(g.target,cur)}</div>
            <div class="goal-ring-wrap">
              <canvas id="goal-ring-${g.id}" style="width:100px;height:100px;"></canvas>
              <div class="goal-ring-center">
                <div class="grc-pct" style="color:${g.color||'#10b981'}">${Math.round(pct*100)}%</div>
                <div class="grc-label">done</div>
              </div>
            </div>
            <div class="goal-stats">
              <div class="goal-stat"><div class="gstat-val">${cs(remaining,cur)}</div><div class="gstat-lbl">Remaining</div></div>
              <div class="goal-stat"><div class="gstat-val">${monthsLeft!==null?monthsLeft+' mo':'—'}</div><div class="gstat-lbl">Est. time</div></div>
              <div class="goal-stat"><div class="gstat-val">${cs(g.monthlyContribution||0,cur)}</div><div class="gstat-lbl">Need/mo</div></div>
            </div>
            <div class="goal-card-actions">
              <button class="goal-action-btn" data-deposit="${g.id}">+ Deposit</button>
              <button class="goal-action-btn" data-edit-goal="${g.id}">Edit</button>
              <button class="goal-action-btn" style="color:var(--red)" data-del-goal="${g.id}">Delete</button>
            </div>
          </div>`
      }).join('')}
      <div class="add-goal-card" id="add-goal-card-btn">
        <div class="add-goal-icon">🎯</div>
        <div class="add-goal-label">Add New Goal</div>
      </div>
    </div>`
}

// ── Loans ─────────────────────────────────────────────────────────────────────

function renderLoans() {
  const { loans } = state.data
  return `
    <div class="page-header">
      <div class="page-header-row">
        <div><div class="page-title">Debt Tracker</div><div class="page-sub">Track loans and repayment progress</div></div>
        <button class="btn btn-primary btn-sm" id="add-loan-btn">+ Add Loan</button>
      </div>
    </div>
    ${loans.length === 0 ? `
      <div class="add-loan-card" id="add-loan-card-btn" style="max-width:400px;margin:40px auto;">
        <div style="font-size:40px;">📉</div>
        <div style="font-size:15px;font-weight:600;">Add your first loan</div>
        <div style="font-size:13px;color:var(--text-muted);">Track student loans, credit cards, mortgages…</div>
      </div>` :
    loans.map(loan => {
      const cur = loanCur(loan)
      const totalRepaid = loan.payments.reduce((s,p) => s+p.amount, 0)
      const balance = Math.max(0, loan.totalDebt - totalRepaid)
      const pct = loan.totalDebt > 0 ? totalRepaid/loan.totalDebt : 0
      const monthsLeft = loan.monthlyPayment > 0 && balance > 0 ? Math.ceil(balance/loan.monthlyPayment) : null
      const isForeign = cur !== profCur()

      return `
        <div class="loan-card mb20">
          <div class="loan-hero">
            <div class="loan-ring-wrap">
              <canvas id="loan-ring-${loan.id}" style="width:90px;height:90px;"></canvas>
              <div class="loan-ring-center"><div class="lrc-pct">${Math.round(pct*100)}%</div><div class="lrc-lbl">repaid</div></div>
            </div>
            <div class="loan-info">
              <div class="loan-name">${loan.name}${isForeign?` <span class="cur-badge">${cur}</span>`:''}</div>
              <div class="loan-balance">${c(balance, cur)}</div>
              <div class="loan-balance-label">remaining balance</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-left:auto;">
              <button class="btn btn-primary btn-sm" data-pay-loan="${loan.id}">+ Payment</button>
              <button class="btn btn-secondary btn-sm" data-edit-loan="${loan.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del-loan="${loan.id}">Delete</button>
            </div>
          </div>
          <div class="loan-stats-row">
            <div class="loan-stat"><div class="lst-val">${cs(loan.totalDebt,cur)}</div><div class="lst-lbl">Original debt</div></div>
            <div class="loan-stat"><div class="lst-val text-emerald">${cs(totalRepaid,cur)}</div><div class="lst-lbl">Total repaid</div></div>
            <div class="loan-stat"><div class="lst-val">${cs(loan.monthlyPayment||0,cur)}</div><div class="lst-lbl">Monthly payment</div></div>
            <div class="loan-stat"><div class="lst-val ${loan.interestRate>0?'text-red':'text-emerald'}">${loan.interestRate>0?loan.interestRate+'%':'0% ✓'}</div><div class="lst-lbl">Interest rate</div></div>
          </div>
          <div class="loan-progress-bar">
            <div class="loan-progress-fill" style="width:${Math.round(pct*100)}%;background:${pct>=1?'#10b981':'#ef4444'}"></div>
          </div>
          <div class="loan-progress-label"><span>${cs(totalRepaid,cur)} repaid</span><span>${cs(balance,cur)} left</span></div>
          ${monthsLeft!==null?`<div class="loan-payoff-estimate">🎯 At ${cs(loan.monthlyPayment,cur)}/month, debt-free in <strong>${monthsLeft} month${monthsLeft!==1?'s':''}</strong> (${addMonths(getCurrentMonthKey(),monthsLeft)})</div>`:''}
          <div class="loan-payments-title">
            Payment History
            <span style="font-size:11px;font-weight:500;color:var(--text-muted);">${loan.payments.length} payment${loan.payments.length!==1?'s':''}</span>
          </div>
          ${loan.payments.length > 0 ? `
            <div class="loan-payments-list">
              ${[...loan.payments].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10).map(p=>`
                <div class="loan-payment-row">
                  <div class="lpr-date">${new Date(p.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>
                  <div class="lpr-note">${p.note||'Payment'}</div>
                  <div class="lpr-amount">-${c(p.amount,cur)}</div>
                  <button class="lpr-del" data-del-payment="${loan.id}|${p.id}">✕</button>
                </div>`).join('')}
            </div>` : `<div class="empty-state" style="padding:20px;"><div class="empty-sub">No payments yet.</div></div>`}
        </div>`
    }).join('')}
  `
}

// ── Dynamic event listeners ───────────────────────────────────────────────────

function attachDynamicListeners() {
  // Setup prompt
  document.getElementById('go-setup-btn')?.addEventListener('click', () => navigate('budget'))

  // Dashboard month navigation
  document.getElementById('dash-prev-month')?.addEventListener('click', () => {
    state.viewMonth = addMonths(state.viewMonth, -1); render()
  })
  document.getElementById('dash-next-month')?.addEventListener('click', () => {
    if (state.viewMonth < getCurrentMonthKey()) { state.viewMonth = addMonths(state.viewMonth, 1); render() }
  })
  document.getElementById('dash-today')?.addEventListener('click', () => {
    state.viewMonth = getCurrentMonthKey(); render()
  })
  // History table rows → jump to that month on dashboard
  document.querySelectorAll('[data-history-month]').forEach(row => {
    row.addEventListener('click', () => { state.viewMonth = row.dataset.historyMonth; render() })
  })

  // Dashboard quick add
  document.getElementById('add-tx-btn-dash')?.addEventListener('click', () => navigate('transactions'))

  // Budget
  document.getElementById('edit-salary-btn')?.addEventListener('click', openSalaryModal)
  document.getElementById('set-currency-btn')?.addEventListener('click', openCurrencyModal)
  document.getElementById('location-badge-btn')?.addEventListener('click', openSalaryModal)
  document.getElementById('add-cat-btn')?.addEventListener('click', () => openCategoryModal())
  document.getElementById('add-cat-btn-2')?.addEventListener('click', () => openCategoryModal())

  document.querySelectorAll('[data-rule]').forEach(btn => {
    btn.addEventListener('click', () => applyRule(btn.dataset.rule))
  })
  document.querySelectorAll('.cbr-input').forEach(input => {
    input.addEventListener('change', e => {
      const cat = state.data.categories.find(c => c.id === e.target.dataset.cat)
      if (cat) { cat.budget = parseFloat(e.target.value) || 0; saveData(); render() }
    })
  })
  document.querySelectorAll('[data-edit-cat]').forEach(el => el.addEventListener('click', () => openCategoryModal(el.dataset.editCat)))
  document.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delCat
      const cat = state.data.categories.find(c => c.id === id)
      const txCount = state.data.transactions.filter(t => t.category === id).length
      if (confirm(`Delete "${cat?.name}"?${txCount>0?` (${txCount} transactions will become uncategorised)`:''}`) ) {
        state.data.categories = state.data.categories.filter(c => c.id !== id)
        saveData(); render()
      }
    })
  })

  // Transactions
  document.getElementById('qa-submit')?.addEventListener('click', addQuickTransaction)
  document.getElementById('qa-amount')?.addEventListener('keydown', e => { if(e.key==='Enter') addQuickTransaction() })
  document.getElementById('tx-search')?.addEventListener('input', debounce(e => {
    if (!document.contains(e.target)) return
    const val = e.target.value
    state.txFilter.search = val
    render()
    requestAnimationFrame(() => {
      const el = document.getElementById('tx-search')
      if (el) { el.focus(); el.setSelectionRange(val.length, val.length) }
    })
  }, 350))
  document.getElementById('tx-cat-filter')?.addEventListener('change', e => { state.txFilter.category = e.target.value; render() })
  document.getElementById('tx-month-filter')?.addEventListener('change', e => { state.txFilter.month = e.target.value; render() })
  document.querySelectorAll('[data-tx-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.data.transactions = state.data.transactions.filter(t => t.id !== btn.dataset.txDel)
      saveData(); render()
    })
  })
  document.getElementById('reset-month-btn')?.addEventListener('click', () => {
    const m = state.txFilter.month
    const count = state.data.transactions.filter(t => getMonthKey(t.date) === m).length
    if (count === 0) return
    if (confirm(`Delete all ${count} transaction${count!==1?'s':''} from ${monthLabelLong(m)}? This cannot be undone.`)) {
      state.data.transactions = state.data.transactions.filter(t => getMonthKey(t.date) !== m)
      saveData(); render()
    }
  })

  // Forecast sliders
  document.querySelectorAll('.sim-slider').forEach(slider => {
    slider.addEventListener('input', e => { state.simAdjust[e.target.dataset.simCat] = parseInt(e.target.value); render() })
  })

  // Goals
  document.getElementById('add-goal-btn')?.addEventListener('click', openGoalModal)
  document.getElementById('add-goal-card-btn')?.addEventListener('click', openGoalModal)
  document.querySelectorAll('[data-deposit]').forEach(btn => btn.addEventListener('click', () => openDepositModal(btn.dataset.deposit)))
  document.querySelectorAll('[data-edit-goal]').forEach(btn => btn.addEventListener('click', () => openGoalModal(btn.dataset.editGoal)))
  document.querySelectorAll('[data-del-goal]').forEach(btn => {
    btn.addEventListener('click', () => { if(confirm('Delete this goal?')){state.data.goals=state.data.goals.filter(g=>g.id!==btn.dataset.delGoal);saveData();render()} })
  })

  // Loans
  document.getElementById('add-loan-btn')?.addEventListener('click', () => openLoanModal())
  document.getElementById('add-loan-card-btn')?.addEventListener('click', () => openLoanModal())
  document.querySelectorAll('[data-pay-loan]').forEach(btn => btn.addEventListener('click', () => openLoanPaymentModal(btn.dataset.payLoan)))
  document.querySelectorAll('[data-edit-loan]').forEach(btn => btn.addEventListener('click', () => openLoanModal(btn.dataset.editLoan)))
  document.querySelectorAll('[data-del-loan]').forEach(btn => {
    btn.addEventListener('click', () => { if(confirm('Delete this loan?')){state.data.loans=state.data.loans.filter(l=>l.id!==btn.dataset.delLoan);saveData();render()} })
  })
  document.querySelectorAll('[data-del-payment]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [loanId, payId] = btn.dataset.delPayment.split('|')
      const loan = state.data.loans.find(l => l.id === loanId)
      if (loan) { loan.payments = loan.payments.filter(p => p.id !== payId); saveData(); render() }
    })
  })

  // Charts
  requestAnimationFrame(() => {
    if (state.view === 'dashboard') {
      const barCanvas = document.getElementById('bar-chart')
      if (barCanvas) {
        const last6 = getLastNMonths(6)
        const spendByMonth = getSpendingByMonth(state.data.transactions)
        const totalBudget = state.data.categories.filter(c=>c.id!=='savings').reduce((s,c)=>s+c.budget,0)
        drawBarChart(barCanvas, last6.map(m=>monthLabel(m)), [
          { data: last6.map(m=>spendByMonth[m]||0), color: '#6366f1' },
          { data: last6.map(()=>totalBudget), color: '#10b98144' },
        ])
      }
      const donutCanvas = document.getElementById('donut-chart')
      if (donutCanvas) {
        const spendCur2 = getSpendingByCategory(state.data.transactions, state.viewMonth)
        drawDonutChart(donutCanvas, state.data.categories.filter(c=>spendCur2[c.id]>0).map(c=>({value:spendCur2[c.id],color:c.color})))
      }
      const healthCanvas = document.getElementById('health-ring')
      if (healthCanvas) {
        const { score } = calcHealthScore(state.data)
        const col = score>=80?'#10b981':score>=60?'#3b82f6':score>=40?'#f59e0b':'#ef4444'
        drawRing(healthCanvas, score/100, col, { lineWidth: 10, padding: 6 })
      }
    }
    if (state.view === 'forecast' && state._forecastChartData) {
      const { chartLabels, chartActualData, chartForecastData, forecastStart } = state._forecastChartData
      const fc = document.getElementById('forecast-line-chart')
      if (fc) drawLineChart(fc, chartLabels, [
        { data: chartActualData, color: '#10b981', fill: true },
        { data: chartForecastData, color: '#8b5cf6', dashed: true, dotRadius: 3 }
      ], { forecastStart })
    }
    if (state.view === 'goals') {
      state.data.goals.forEach(g => {
        const canvas = document.getElementById(`goal-ring-${g.id}`)
        if (canvas) drawRing(canvas, Math.min(1,g.current/g.target), g.color||'#10b981', { lineWidth: 10, padding: 6 })
      })
    }
    if (state.view === 'loans') {
      state.data.loans.forEach(loan => {
        const canvas = document.getElementById(`loan-ring-${loan.id}`)
        if (canvas) {
          const repaid = loan.payments.reduce((s,p)=>s+p.amount,0)
          const pct = loan.totalDebt > 0 ? Math.min(1, repaid/loan.totalDebt) : 0
          drawRing(canvas, pct, pct>=1?'#10b981':'#ef4444', { lineWidth: 10, padding: 6 })
        }
      })
    }
  })
}

// ── Quick add transaction ─────────────────────────────────────────────────────

function addQuickTransaction() {
  const desc     = document.getElementById('qa-desc')?.value.trim()
  const amount   = parseFloat(document.getElementById('qa-amount')?.value)
  const currency = document.getElementById('qa-currency')?.value || profCur()
  const cat      = document.getElementById('qa-cat')?.value
  const date     = document.getElementById('qa-date')?.value
  const type     = document.getElementById('qa-type')?.value
  if (!amount || isNaN(amount) || amount <= 0) { document.getElementById('qa-amount')?.focus(); return }
  state.data.transactions.push({ id: uuid(), description: desc||'', amount, currency, category: cat, date, type: type||'expense' })
  saveData()
  state.txFilter.month = getMonthKey(date)
  render()
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(html) {
  const root = document.getElementById('modal-root')
  root.innerHTML = `<div class="modal-backdrop" id="modal-bg">${html}</div>`
  root.querySelector('#modal-bg').addEventListener('click', e => { if(e.target.id==='modal-bg') closeModal() })
}
function closeModal() { document.getElementById('modal-root').innerHTML = '' }

function currencySelect(id, selected) {
  return `<select class="field-input" id="${id}">${CURRENCIES.map(cur=>`<option value="${cur}" ${cur===selected?'selected':''}>${cur}</option>`).join('')}</select>`
}

// ── Salary modal ──────────────────────────────────────────────────────────────

function openSalaryModal() {
  const { profile } = state.data
  const salary = profile.salaryNet || ''
  const locations = ['London','Manchester','Edinburgh','Bristol','Birmingham','Paris','Amsterdam','Berlin','Dublin','New York','Remote']

  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">Salary & Location</div><button class="modal-close" id="mc">×</button></div>
      <div class="salary-input-hero">
        <div class="sih-icon">💼</div>
        <div class="sih-label">Monthly Net Take-Home</div>
        <input class="salary-big-input" id="salary-input" type="number" value="${salary}" placeholder="0" autofocus>
      </div>
      <div class="salary-divider">50/30/20 Preview</div>
      <div id="rule-preview">${renderRulePreview(salary||0, profile.currency)}</div>
      <div class="field-row" style="margin-top:16px;">
        <div class="field"><label class="field-label">Your name</label><input class="field-input" id="name-input" type="text" value="${profile.name}" placeholder="e.g. Elena"></div>
        <div class="field"><label class="field-label">City / Location</label>
          <select class="field-input" id="location-input">
            ${locations.map(l=>`<option value="${l}" ${l===profile.location?'selected':''}>${l}</option>`).join('')}
            <option value="${profile.location||''}" ${!locations.includes(profile.location)?'selected':''}>Other</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="mc2">Cancel</button>
        <button class="btn btn-primary" id="save-salary-btn">Save</button>
      </div>
    </div>`)

  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.getElementById('salary-input')?.addEventListener('input', e => {
    document.getElementById('rule-preview').innerHTML = renderRulePreview(parseFloat(e.target.value)||0, profile.currency)
  })
  document.getElementById('save-salary-btn')?.addEventListener('click', () => {
    const val = parseFloat(document.getElementById('salary-input').value)
    if (val > 0) {
      state.data.profile.salaryNet = val
      state.data.profile.name = document.getElementById('name-input').value.trim()
      state.data.profile.location = document.getElementById('location-input').value
      state.data.profile.updatedAt = new Date().toISOString()
      saveData(); closeModal(); render()
    }
  })
}

function renderRulePreview(salary, currency='£') {
  return `<div class="rule-preview">
    <div class="rule-card needs"><div class="rc-label">Needs</div><div class="rc-pct" style="color:#92400e">50%</div><div class="rc-amount">${c(salary*.5,currency)}</div></div>
    <div class="rule-card wants"><div class="rc-label">Wants</div><div class="rc-pct" style="color:#1d4ed8">30%</div><div class="rc-amount">${c(salary*.3,currency)}</div></div>
    <div class="rule-card saves"><div class="rc-label">Savings</div><div class="rc-pct" style="color:#047857">20%</div><div class="rc-amount">${c(salary*.2,currency)}</div></div>
  </div>`
}

function openCurrencyModal() {
  const cur = profCur()
  openModal(`
    <div class="modal" style="max-width:340px;">
      <div class="modal-header"><div class="modal-title">Base Currency</div><button class="modal-close" id="mc">×</button></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">This sets your main currency. Individual transactions, goals and loans can each use a different currency.</p>
      <div class="field"><label class="field-label">Currency Symbol</label>${currencySelect('currency-select', cur)}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="mc">Cancel</button>
        <button class="btn btn-primary" id="save-cur">Save</button>
      </div>
    </div>`)
  document.querySelectorAll('#mc').forEach(b=>b.addEventListener('click',closeModal))
  document.getElementById('save-cur')?.addEventListener('click',()=>{
    state.data.profile.currency = document.getElementById('currency-select').value
    saveData(); closeModal(); render()
  })
}

// ── Category modal ────────────────────────────────────────────────────────────

function openCategoryModal(editId) {
  const existing = editId ? state.data.categories.find(c => c.id === editId) : null
  const icons = ['🏠','🍽️','🚌','💊','⚡','🛍️','🎬','📱','📚','🏦','📦','☕','🚗','✈️','🎵','🍺','🏋️','💈','🐾','🎮','🧴','🎁','🍕','🛒','🧾','💡','🏥','🎓']
  const colors = ['#6366f1','#f59e0b','#3b82f6','#10b981','#f97316','#ec4899','#8b5cf6','#14b8a6','#ef4444','#06b6d4','#84cc16','#6b7280']
  let selIcon = existing?.icon || '📦'
  let selColor = existing?.color || '#6366f1'

  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Category':'New Category'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field"><label class="field-label">Name</label><input class="field-input" id="cat-name" type="text" value="${existing?.name||''}" placeholder="e.g. Gym, Pets…" autofocus></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Essential?</label><select class="field-input" id="cat-essential"><option value="0" ${!existing?.essential?'selected':''}>No (Want)</option><option value="1" ${existing?.essential?'selected':''}>Yes (Need)</option></select></div>
        <div class="field"><label class="field-label">Starting Budget</label><input class="field-input" id="cat-budget" type="number" value="${existing?.budget||''}" placeholder="0"></div>
      </div>
      <div class="field"><label class="field-label">Icon</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;" id="icon-picker">
          ${icons.map(ic=>`<span data-icon="${ic}" style="font-size:20px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${ic===selIcon?'#10b981':'transparent'}">${ic}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;" id="color-picker">
          ${colors.map(c=>`<div data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===selColor?'#0f172a':'transparent'}"></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="mc2">Cancel</button>
        <button class="btn btn-primary" id="save-cat-btn">${existing?'Update':'Add Category'}</button>
      </div>
    </div>`)

  document.getElementById('mc')?.addEventListener('click',closeModal)
  document.getElementById('mc2')?.addEventListener('click',closeModal)
  document.querySelectorAll('#icon-picker span').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#icon-picker span').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#10b981';selIcon=el.dataset.icon})})
  document.querySelectorAll('#color-picker div').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#color-picker div').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#0f172a';selColor=el.dataset.color})})
  document.getElementById('save-cat-btn')?.addEventListener('click',()=>{
    const name=document.getElementById('cat-name').value.trim()
    if(!name) return
    const budget=parseFloat(document.getElementById('cat-budget').value)||0
    const essential=document.getElementById('cat-essential').value==='1'
    if(existing){Object.assign(existing,{name,icon:selIcon,color:selColor,essential,budget})}
    else{state.data.categories.push({id:'cat_'+uuid().slice(0,8),name,icon:selIcon,color:selColor,essential,budget})}
    saveData();closeModal();render()
  })
}

// ── Goal modal ────────────────────────────────────────────────────────────────

function openGoalModal(editId) {
  const existing = editId ? state.data.goals.find(g=>g.id===editId) : null
  const icons = ['🎯','🏖️','🏠','🚗','🎓','✈️','💍','🏋️','🛡️','🎸','💻','🌍']
  const colors = ['#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
  let selIcon = existing?.icon || '🎯'
  let selColor = existing?.color || '#10b981'

  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Goal':'New Goal'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Goal Name</label><input class="field-input" id="g-name" type="text" value="${existing?.name||''}" placeholder="Emergency Fund" autofocus></div>
        <div class="field"><label class="field-label">Currency</label>${currencySelect('g-currency', existing?.currency||profCur())}</div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Target Amount</label><input class="field-input" id="g-target" type="number" value="${existing?.target||''}" placeholder="5000"></div>
        <div class="field"><label class="field-label">Current Saved</label><input class="field-input" id="g-current" type="number" value="${existing?.current||''}" placeholder="0"></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Monthly Contribution</label><input class="field-input" id="g-monthly" type="number" value="${existing?.monthlyContribution||''}" placeholder="200"></div>
        <div class="field"><label class="field-label">Deadline (optional)</label><input class="field-input" id="g-deadline" type="date" value="${existing?.deadline||''}"></div>
      </div>
      <div class="field"><label class="field-label">Icon</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;" id="gicon-picker">
          ${icons.map(ic=>`<span data-icon="${ic}" style="font-size:22px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${ic===selIcon?'#10b981':'transparent'}">${ic}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Color</label>
        <div style="display:flex;gap:8px;margin-top:6px;" id="gcolor-picker">
          ${colors.map(c=>`<div data-color="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===selColor?'#0f172a':'transparent'}"></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="mc2">Cancel</button>
        <button class="btn btn-primary" id="save-goal-btn">${existing?'Update':'Create'}</button>
      </div>
    </div>`)

  document.getElementById('mc')?.addEventListener('click',closeModal)
  document.getElementById('mc2')?.addEventListener('click',closeModal)
  document.querySelectorAll('#gicon-picker span').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#gicon-picker span').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#10b981';selIcon=el.dataset.icon})})
  document.querySelectorAll('#gcolor-picker div').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#gcolor-picker div').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#0f172a';selColor=el.dataset.color})})
  document.getElementById('save-goal-btn')?.addEventListener('click',()=>{
    const name=document.getElementById('g-name').value.trim()
    const target=parseFloat(document.getElementById('g-target').value)
    if(!name||!target) return
    const goal={id:existing?.id||uuid(),name,target,current:parseFloat(document.getElementById('g-current').value)||0,monthlyContribution:parseFloat(document.getElementById('g-monthly').value)||0,deadline:document.getElementById('g-deadline').value||null,icon:selIcon,color:selColor,currency:document.getElementById('g-currency').value}
    if(existing){const idx=state.data.goals.findIndex(g=>g.id===existing.id);state.data.goals[idx]=goal}
    else state.data.goals.push(goal)
    saveData();closeModal();render()
  })
}

function openDepositModal(goalId) {
  const goal = state.data.goals.find(g=>g.id===goalId)
  if (!goal) return
  const cur = goalCur(goal)
  openModal(`
    <div class="modal" style="max-width:360px;">
      <div class="modal-header"><div class="modal-title">${goal.icon} Deposit to ${goal.name}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field"><label class="field-label">Amount (${cur})</label><input class="field-input" id="dep-amt" type="number" placeholder="0.00" autofocus></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:-8px;">${c(goal.current,cur)} / ${c(goal.target,cur)}</div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-dep">Add</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click',closeModal)
  document.getElementById('mc2')?.addEventListener('click',closeModal)
  document.getElementById('save-dep')?.addEventListener('click',()=>{const amt=parseFloat(document.getElementById('dep-amt').value);if(amt>0){goal.current=Math.min(goal.target,goal.current+amt);saveData();closeModal();render()}})
}

// ── Loan modals ───────────────────────────────────────────────────────────────

function openLoanModal(editId) {
  const existing = editId ? state.data.loans.find(l=>l.id===editId) : null
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Loan':'New Loan'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Loan Name</label><input class="field-input" id="l-name" type="text" value="${existing?.name||''}" placeholder="Student Loan, Credit Card…" autofocus></div>
        <div class="field"><label class="field-label">Currency</label>${currencySelect('l-currency', existing?.currency||profCur())}</div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Total Debt</label><input class="field-input" id="l-total" type="number" value="${existing?.totalDebt||''}" placeholder="50000"></div>
        <div class="field"><label class="field-label">Monthly Payment</label><input class="field-input" id="l-monthly" type="number" value="${existing?.monthlyPayment||''}" placeholder="500"></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Interest Rate (%)</label><input class="field-input" id="l-interest" type="number" value="${existing?.interestRate||0}" placeholder="0" step="0.1"><div class="field-hint">Set to 0 for interest-free</div></div>
        <div class="field"><label class="field-label">Start Date</label><input class="field-input" id="l-start" type="date" value="${existing?.startDate||new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-loan-btn">${existing?'Update':'Add Loan'}</button></div>
    </div>`)

  document.getElementById('mc')?.addEventListener('click',closeModal)
  document.getElementById('mc2')?.addEventListener('click',closeModal)
  document.getElementById('save-loan-btn')?.addEventListener('click',()=>{
    const name=document.getElementById('l-name').value.trim()
    const totalDebt=parseFloat(document.getElementById('l-total').value)
    if(!name||!totalDebt) return
    const loan={id:existing?.id||uuid(),name,totalDebt,monthlyPayment:parseFloat(document.getElementById('l-monthly').value)||0,interestRate:parseFloat(document.getElementById('l-interest').value)||0,startDate:document.getElementById('l-start').value,currency:document.getElementById('l-currency').value,payments:existing?.payments||[]}
    if(existing){const idx=state.data.loans.findIndex(l=>l.id===existing.id);state.data.loans[idx]=loan}
    else state.data.loans.push(loan)
    saveData();closeModal();render()
  })
}

function openLoanPaymentModal(loanId) {
  const loan = state.data.loans.find(l=>l.id===loanId)
  if (!loan) return
  const cur = loanCur(loan)
  const repaid = loan.payments.reduce((s,p)=>s+p.amount,0)
  const balance = Math.max(0, loan.totalDebt-repaid)
  openModal(`
    <div class="modal" style="max-width:380px;">
      <div class="modal-header"><div class="modal-title">📉 Payment — ${loan.name}</div><button class="modal-close" id="mc">×</button></div>
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Current Balance</div>
        <div style="font-size:32px;font-weight:800;color:var(--red);letter-spacing:-1px;">${c(balance,cur)}</div>
      </div>
      <div class="field"><label class="field-label">Payment Amount (${cur})</label><input class="field-input" id="pay-amt" type="number" placeholder="${loan.monthlyPayment||''}" value="${loan.monthlyPayment||''}" autofocus></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Date</label><input class="field-input" id="pay-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="field"><label class="field-label">Note</label><input class="field-input" id="pay-note" type="text" placeholder="Monthly payment…"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-pay-btn">Record Payment</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click',closeModal)
  document.getElementById('mc2')?.addEventListener('click',closeModal)
  document.getElementById('save-pay-btn')?.addEventListener('click',()=>{
    const amt=parseFloat(document.getElementById('pay-amt').value)
    if(!amt||amt<=0) return
    loan.payments.push({id:uuid(),amount:amt,date:document.getElementById('pay-date').value,note:document.getElementById('pay-note').value.trim()||'Payment'})
    saveData();closeModal();render()
  })
}

// ── Rule wizard ───────────────────────────────────────────────────────────────

function applyRule(rule) {
  const salary = state.data.profile.salaryNet
  if (!salary) { openSalaryModal(); return }
  const loc = (state.data.profile.location || '').toLowerCase()
  const isUK = ['london','manchester','edinburgh','bristol','birmingham','dublin'].some(c => loc.includes(c))
  const isEU = ['paris','amsterdam','berlin'].some(c => loc.includes(c))

  const RULES = {
    '503020': isUK
      ? { housing:.37, food:.07, transport:.05, utilities:.00, health:.00, shopping:.06, entertainment:.05, subscriptions:.04, savings:.20, education:.03, other:.13 }
      : isEU
      ? { housing:.32, food:.08, transport:.05, utilities:.02, health:.02, shopping:.07, entertainment:.06, subscriptions:.04, savings:.20, education:.04, other:.10 }
      : { housing:.25, food:.10, transport:.05, utilities:.05, health:.05, shopping:.08, entertainment:.07, subscriptions:.05, savings:.20, education:.05, other:.05 },
    '702010': isUK
      ? { housing:.38, food:.08, transport:.06, utilities:.00, health:.00, shopping:.08, entertainment:.06, subscriptions:.04, savings:.20, education:.03, other:.07 }
      : { housing:.28, food:.12, transport:.08, utilities:.06, health:.06, shopping:.08, entertainment:.06, subscriptions:.04, savings:.20, education:.02, other:.00 },
    '601030': isUK
      ? { housing:.32, food:.07, transport:.05, utilities:.00, health:.00, shopping:.04, entertainment:.04, subscriptions:.03, savings:.30, education:.05, other:.10 }
      : { housing:.22, food:.10, transport:.07, utilities:.05, health:.06, shopping:.05, entertainment:.05, subscriptions:.03, savings:.30, education:.05, other:.02 },
  }
  const allocation = RULES[rule]
  if (!allocation) return
  state.data.categories.forEach(cat => {
    if (allocation[cat.id] !== undefined) cat.budget = Math.round(salary * allocation[cat.id])
  })
  saveData(); render()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) } }

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const saved = await window.budget.load()
  if (saved) {
    const merged = defaultData()
    if (saved.profile) Object.assign(merged.profile, saved.profile)
    if (saved.categories) {
      merged.categories = saved.categories.map(sc => {
        const def = merged.categories.find(c => c.id === sc.id)
        return def ? Object.assign({}, def, sc) : sc
      })
      const missing = defaultData().categories.filter(dc => !merged.categories.find(c => c.id === dc.id))
      merged.categories = [...merged.categories, ...missing]
    }
    if (saved.transactions) merged.transactions = saved.transactions
    if (saved.goals)        merged.goals = saved.goals
    if (saved.loans)        merged.loans = saved.loans
    state.data = merged
  }
  state.txFilter.month = getCurrentMonthKey()
  state.viewMonth = getCurrentMonthKey()

  // Nav listeners — attached once only
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view))
  })

  render()
}

init()
