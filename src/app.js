// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  view: 'dashboard',
  data: defaultData(),
  selectedMonth: getCurrentMonthKey(),
  txFilter: { search: '', category: 'all', month: getCurrentMonthKey() },
  simAdjust: {},
}

function setState(updates) {
  Object.assign(state, updates)
  render()
}

async function saveData() {
  await window.budget.save(state.data)
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
  const { profile, categories, transactions, goals } = state.data
  const hasSalary = profile.salaryNet > 0

  updateSidebar()

  if (!hasSalary && state.view !== 'budget') {
    container.innerHTML = renderSetupPrompt()
    document.getElementById('go-setup-btn')?.addEventListener('click', () => navigate('budget'))
    return
  }

  switch (state.view) {
    case 'dashboard':    container.innerHTML = renderDashboard(); break
    case 'budget':       container.innerHTML = renderBudget();    break
    case 'transactions': container.innerHTML = renderTransactions(); break
    case 'forecast':     container.innerHTML = renderForecast(); break
    case 'goals':        container.innerHTML = renderGoals();    break
  }
  attachEventListeners()
}

function updateSidebar() {
  const { profile } = state.data
  document.getElementById('sidebar-salary').textContent =
    profile.salaryNet > 0 ? fmtCurrencyFull(profile.salaryNet, profile.currency) : '—'
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
  const cur = getCurrentMonthKey()
  const prev = addMonths(cur, -1)
  const currency = profile.currency
  const salary = profile.salaryNet

  const spendCur = getSpendingByCategory(transactions, cur)
  const spendPrev = getSpendingByCategory(transactions, prev)
  const totalCur = Object.values(spendCur).reduce((a, b) => a + b, 0)
  const totalPrev = Object.values(spendPrev).reduce((a, b) => a + b, 0)
  const remaining = salary - totalCur
  const savingsCat = categories.find(c => c.id === 'savings')
  const savingsRate = savingsCat?.budget > 0 ? Math.round((savingsCat.budget / salary) * 100) : 0

  const { score, breakdown } = calcHealthScore(state.data)
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
  const gradeLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work'

  const spendDelta = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev * 100).toFixed(1) : null

  const recentTx = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 7)

  const catSpendsWithBudget = categories
    .filter(c => c.id !== 'savings' && (spendCur[c.id] || c.budget))
    .map(c => ({ ...c, spent: spendCur[c.id] || 0 }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6)

  const insights = generateInsights(state.data)
  const last6 = getLastNMonths(6)
  const spendByMonth = getSpendingByMonth(transactions)
  const totalBudget = categories.filter(c => c.id !== 'savings').reduce((s, c) => s + c.budget, 0)

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">${monthLabelLong(cur)}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="add-tx-btn-dash">+ Add Transaction</button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon">💼</div>
        <div class="stat-val">${fmtCurrency(salary, currency)}</div>
        <div class="stat-lbl">Monthly Income</div>
        <div class="stat-delta neu">Net take-home</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💳</div>
        <div class="stat-val ${totalCur > salary ? 'text-red' : ''}">${fmtCurrency(totalCur, currency)}</div>
        <div class="stat-lbl">Spent This Month</div>
        <div class="stat-delta ${spendDelta === null ? 'neu' : totalCur > totalPrev ? 'neg' : 'pos'}">
          ${spendDelta !== null ? (totalCur > totalPrev ? '↑' : '↓') + Math.abs(spendDelta) + '% vs last month' : 'First month tracked'}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${remaining >= 0 ? '✅' : '🚨'}</div>
        <div class="stat-val ${remaining < 0 ? 'text-red' : 'text-emerald'}">${fmtCurrency(Math.abs(remaining), currency)}</div>
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
              <div class="hb-bar-track">
                <div class="hb-bar-fill" style="width:${(b.pts/b.max)*100}%;background:${b.color}"></div>
              </div>
              <div class="hb-pts">${b.pts}/${b.max}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid-col-5-7 mb20">
      <div class="card">
        <div class="card-title">Spending by Category</div>
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
                  <div class="csl-bar-track">
                    <div class="csl-bar-fill" style="width:${pct}%;background:${c.color}"></div>
                  </div>
                </div>
                <div class="csl-amounts">
                  <div class="csl-spent ${over ? 'csl-over' : ''}">${fmtCurrency(c.spent, currency)}</div>
                  <div class="csl-budget">/ ${fmtCurrency(c.budget, currency)}</div>
                </div>
              </div>`
          }).join('')}
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <div class="card-title">Smart Insights</div>
          <div class="insight-list">
            ${insights.map(i => `
              <div class="insight-item ${i.type}">
                <span class="insight-icon">${i.icon}</span>
                <span>${i.text}</span>
              </div>`).join('')}
          </div>
        </div>
        <div>
          <div class="card-title">Recent Transactions</div>
          <div class="tx-list">
            ${recentTx.length ? recentTx.map(t => {
              const cat = state.data.categories.find(c => c.id === t.category) || { icon: '📦', color: '#6b7280', name: t.category }
              return `
                <div class="tx-item">
                  <div class="tx-icon-wrap" style="background:${cat.color}22;">${cat.icon}</div>
                  <div class="tx-info">
                    <div class="tx-desc">${t.description || cat.name}</div>
                    <div class="tx-meta">${cat.name} · ${new Date(t.date).toLocaleDateString('en-US', {month:'short',day:'numeric'})}</div>
                  </div>
                  <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtCurrency(t.amount, currency)}</div>
                </div>`
            }).join('') : '<div class="empty-state" style="padding:24px"><div class="empty-icon">💳</div><div class="empty-sub">No transactions yet</div></div>'}
          </div>
        </div>
      </div>
    </div>`
}

// ── Budget Setup ──────────────────────────────────────────────────────────────

function renderBudget() {
  const { profile, categories } = state.data
  const salary = profile.salaryNet
  const currency = profile.currency
  const totalAllocated = categories.reduce((s, c) => s + c.budget, 0)
  const remaining = salary - totalAllocated
  const pct = salary > 0 ? Math.min(100, Math.round((totalAllocated / salary) * 100)) : 0
  const over = totalAllocated > salary

  return `
    <div class="page-header">
      <div class="page-title">Budget Setup</div>
      <div class="page-sub">Define how your monthly income should be allocated</div>
    </div>

    <div class="salary-hero">
      <div class="sh-left">
        <div class="sh-label">Monthly Net Salary</div>
        <div class="sh-amount">${salary > 0 ? fmtCurrencyFull(salary, currency) : '—'}</div>
        <div class="sh-sub">Take-home pay after taxes &amp; deductions</div>
        <div class="allocation-summary" style="margin-top:14px;">
          <div class="alloc-pill allocated">Allocated: ${fmtCurrency(totalAllocated, currency)}</div>
          <div class="alloc-pill ${over ? 'over' : 'remaining'}">${over ? 'Over by: ' + fmtCurrency(totalAllocated - salary, currency) : 'Free: ' + fmtCurrency(remaining, currency)}</div>
        </div>
      </div>
      <div class="sh-right">
        <button class="sh-btn sh-btn-primary" id="edit-salary-btn">✏️ Edit Salary</button>
        <button class="sh-btn sh-btn-secondary" id="set-currency-btn">🌍 ${currency} Currency</button>
      </div>
    </div>

    <div class="budget-progress-bar mb20">
      <div class="budget-progress-fill ${over ? 'over' : pct > 90 ? 'near' : ''}" style="width:${pct}%"></div>
    </div>

    <div class="rule-wizard mb20">
      <div class="rw-text">
        <strong>Smart Allocation Wizard</strong> — Auto-distribute your salary using a popular rule:
      </div>
      <div class="rw-btns">
        <button class="rw-btn" data-rule="503020">50/30/20</button>
        <button class="rw-btn" data-rule="702010">70/20/10</button>
        <button class="rw-btn" data-rule="601030">60/10/30</button>
      </div>
    </div>

    <div class="card-title mb12" style="font-size:13px;">Category Budgets</div>
    <div class="cat-budget-grid">
      ${categories.map(c => {
        const pctOfSalary = salary > 0 && c.budget > 0 ? Math.round((c.budget / salary) * 100) : 0
        return `
          <div class="cat-budget-row">
            <div class="cbr-icon">${c.icon}</div>
            <div class="cbr-info">
              <div class="cbr-name">${c.name}</div>
              <div class="cbr-pct">
                ${pctOfSalary > 0 ? `<span>${pctOfSalary}%</span> of income` : 'Not allocated'}
              </div>
            </div>
            ${c.essential ? '<div class="cbr-essential">Essential</div>' : ''}
            <div class="cbr-input-wrap">
              <div class="cbr-currency">${currency}</div>
              <input type="number" class="cbr-input" data-cat="${c.id}" value="${c.budget || ''}" placeholder="0" min="0" step="10">
            </div>
          </div>`
      }).join('')}
    </div>`
}

// ── Transactions ──────────────────────────────────────────────────────────────

function renderTransactions() {
  const { profile, categories, transactions } = state.data
  const currency = profile.currency
  const { search, category, month } = state.txFilter

  let filtered = transactions.filter(t => {
    if (category !== 'all' && t.category !== category) return false
    if (month !== 'all' && getMonthKey(t.date) !== month) return false
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => new Date(b.date) - new Date(a.date))

  const allMonths = [...new Set(transactions.map(t => getMonthKey(t.date)))].sort().reverse()

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
          <div class="page-sub">${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>

    <div class="quick-add">
      <div class="qa-title">Quick Add</div>
      <div class="qa-fields">
        <div class="qa-field">
          <div class="qa-label">Description</div>
          <input class="qa-input" id="qa-desc" type="text" placeholder="e.g. Coffee, Rent, Salary…">
        </div>
        <div class="qa-field">
          <div class="qa-label">Amount (${currency})</div>
          <input class="qa-input" id="qa-amount" type="number" placeholder="0.00" min="0" step="0.01">
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
        ${categories.map(c => `<option value="${c.id}" ${category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
      <select class="filter-sel" id="tx-month-filter">
        <option value="all" ${month === 'all' ? 'selected' : ''}>All months</option>
        ${allMonths.map(m => `<option value="${m}" ${month === m ? 'selected' : ''}>${monthLabelLong(m)}</option>`).join('')}
      </select>
    </div>

    ${Object.keys(grouped).length ? `
      <div class="tx-full-list">
        ${Object.keys(grouped).sort().reverse().map(m => {
          const monthTotal = grouped[m].filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
          return `
            <div class="tx-month-group">
              <span>${monthLabelLong(m)}</span>
              <span class="tx-month-total">-${fmtCurrencyFull(monthTotal, currency)}</span>
            </div>
            ${grouped[m].map(t => {
              const cat = categories.find(c => c.id === t.category) || { icon: '📦', color: '#6b7280', name: t.category }
              return `
                <div class="tx-full-item">
                  <div class="tx-date-badge">${new Date(t.date).toLocaleDateString('en-US', {month:'short',day:'numeric'})}</div>
                  <div class="tx-icon-wrap" style="background:${cat.color}22;">${cat.icon}</div>
                  <div class="tx-info">
                    <div class="tx-desc">${t.description || cat.name}</div>
                    <div class="tx-meta">${cat.name}</div>
                  </div>
                  <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtCurrencyFull(t.amount, currency)}</div>
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
  const currency = profile.currency
  const salary = profile.salaryNet
  const forecasts = forecastSpending(state.data, 3)
  const cur = getCurrentMonthKey()

  const forecastMonths = [addMonths(cur, 1), addMonths(cur, 2), addMonths(cur, 3)]
  const monthlyTotals = forecastMonths.map(m => {
    return Object.values(forecasts).reduce((s, f) => s + (f.forecast[forecastMonths.indexOf(m)] || 0), 0)
  })

  const last6 = getLastNMonths(6)
  const spendByMonth = getSpendingByMonth(transactions)
  const last6Actual = last6.map(m => spendByMonth[m] || null)

  const activeCats = categories.filter(c => c.id !== 'savings' && forecasts[c.id]?.avg > 0)

  const simAdjusted = activeCats.map(c => {
    const adj = state.simAdjust[c.id] !== undefined ? state.simAdjust[c.id] : 0
    const baseAvg = forecasts[c.id]?.avg || 0
    const adjusted = Math.max(0, baseAvg * (1 + adj / 100))
    return { ...c, baseAvg, adjusted, adj }
  })

  const simTotal = simAdjusted.reduce((s, c) => s + c.adjusted, 0)
  const simSavings = salary - simTotal
  const baseTotal = simAdjusted.reduce((s, c) => s + c.baseAvg, 0)

  const chartMonths = [...last6, ...forecastMonths]
  const chartLabels = chartMonths.map(m => monthLabel(m))

  const chartActualData = last6Actual.concat([null, null, null])
  const forecastAvgs = forecastMonths.map(m => monthlyTotals[forecastMonths.indexOf(m)])
  const lastActual = last6Actual.filter(v => v != null).slice(-1)[0] || 0
  const chartForecastData = [...last6Actual.slice(0, -1), lastActual, ...forecastAvgs]

  return `
    <div class="page-header">
      <div class="page-title">Forecast & Simulation</div>
      <div class="page-sub">AI-powered spending predictions based on your historical patterns</div>
    </div>

    <div class="forecast-hero mb20">
      <div class="fh-label">Projected Next 3 Months</div>
      <div class="fh-title">
        Based on your trends, you'll spend ~${fmtCurrency(monthlyTotals[0], currency)}/month
      </div>
      <div class="fh-sub">Weighted moving average over last ${last6.filter(m => spendByMonth[m]).length} months of data</div>
      <div class="fh-months">
        ${forecastMonths.map((m, i) => {
          const prev = i === 0 ? (spendByMonth[last6[last6.length - 1]] || 0) : monthlyTotals[i-1]
          const delta = prev > 0 ? ((monthlyTotals[i] - prev) / prev * 100).toFixed(1) : 0
          return `
            <div class="fhmc">
              <div class="fhmc-label">${monthLabel(m)}</div>
              <div class="fhmc-amount">${fmtCurrency(monthlyTotals[i], currency)}</div>
              <div class="fhmc-delta ${monthlyTotals[i] > prev ? 'up' : 'down'}">
                ${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs prior
              </div>
            </div>`
        }).join('')}
      </div>
    </div>

    <div class="card mb20">
      <div class="card-title">Spending Trend — 6 Months History + 3 Month Forecast</div>
      <canvas id="forecast-line-chart" class="chart" style="width:100%;height:220px;"></canvas>
    </div>

    <div class="grid-2 mb20">
      <div class="card">
        <div class="card-title">Category Forecast Breakdown</div>
        <table class="forecast-cat-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Avg/mo</th>
              <th>Next Month</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            ${activeCats.map(c => {
              const f = forecasts[c.id]
              const trend = f.trend
              const trendSymbol = Math.abs(trend) < 5 ? '→' : trend > 0 ? '↑' : '↓'
              const trendClass = Math.abs(trend) < 5 ? 'trend-stable' : trend > 0 ? 'trend-up' : 'trend-down'
              return `
                <tr>
                  <td>${c.icon} ${c.name}</td>
                  <td>${fmtCurrency(f.avg, currency)}</td>
                  <td>${fmtCurrency(f.forecast[0], currency)}</td>
                  <td class="${trendClass}">${trendSymbol} ${Math.abs(trend).toFixed(0)}/mo</td>
                </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="scenario-sim">
        <div class="sim-label">⚗️ Scenario Simulator — Adjust your spending</div>
        <div class="sim-sliders">
          ${simAdjusted.slice(0, 6).map(c => `
            <div class="sim-row">
              <div class="sim-cat-name">${c.icon} ${c.name}</div>
              <input type="range" class="sim-slider" data-sim-cat="${c.id}" min="-80" max="80" value="${c.adj}" step="5">
              <div class="sim-val">${fmtCurrency(c.adjusted, currency)}</div>
              <div class="sim-delta ${c.adj > 0 ? 'text-red' : c.adj < 0 ? 'text-emerald' : 'text-muted'}">
                ${c.adj !== 0 ? (c.adj > 0 ? '+' : '') + c.adj + '%' : '±0%'}
              </div>
            </div>`).join('')}
        </div>
        <div class="sim-result">
          <div>
            <div class="sr-label">Projected monthly savings after adjustments</div>
            <div class="fz12 text-muted" style="margin-top:2px;">vs ${fmtCurrency(salary - baseTotal, currency)} without adjustments</div>
          </div>
          <div class="sr-amount ${simSavings >= 0 ? 'good' : 'bad'}">${fmtCurrencyFull(simSavings, currency)}</div>
        </div>
      </div>
    </div>

  `
  // Store chart data for attachEventListeners to draw after innerHTML is set
  state._forecastChartData = { chartLabels, chartActualData, chartForecastData, forecastStart: last6.length - 1 }
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function renderGoals() {
  const { profile, goals, transactions } = state.data
  const currency = profile.currency
  const salary = profile.salaryNet

  const monthly = getMonthlyByCategory(transactions)
  const savingsMonths = Object.keys(monthly)
  const avgMonthlySaved = savingsMonths.length > 0
    ? savingsMonths.reduce((s, m) => s + (monthly[m]?.savings || 0), 0) / savingsMonths.length
    : 0

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">Savings Goals</div>
          <div class="page-sub">${goals.length} active goal${goals.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="add-goal-btn">+ New Goal</button>
      </div>
    </div>

    <div class="goals-grid">
      ${goals.map(g => {
        const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0
        const remaining = g.target - g.current
        const monthlyNeeded = g.deadline
          ? Math.max(0, remaining / Math.max(1, monthsBetween(new Date().toISOString().slice(0,10), g.deadline)))
          : 0
        const monthsLeft = avgMonthlySaved > 0 && remaining > 0
          ? Math.ceil(remaining / (g.monthlyContribution || avgMonthlySaved))
          : null

        return `
          <div class="goal-card" style="--goal-color:${g.color || '#10b981'}">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${g.color || '#10b981'};border-radius:16px 16px 0 0;"></div>
            <div style="text-align:center;font-size:26px;margin-bottom:6px;">${g.icon || '🎯'}</div>
            <div class="goal-name">${g.name}</div>
            <div class="goal-amounts">
              <strong>${fmtCurrencyFull(g.current, currency)}</strong> of ${fmtCurrencyFull(g.target, currency)}
            </div>
            <div class="goal-ring-wrap">
              <canvas id="goal-ring-${g.id}" style="width:100px;height:100px;"></canvas>
              <div class="goal-ring-center">
                <div class="grc-pct" style="color:${g.color || '#10b981'}">${Math.round(pct * 100)}%</div>
                <div class="grc-label">done</div>
              </div>
            </div>
            <div class="goal-stats">
              <div class="goal-stat">
                <div class="gstat-val">${fmtCurrency(remaining, currency)}</div>
                <div class="gstat-lbl">Remaining</div>
              </div>
              <div class="goal-stat">
                <div class="gstat-val">${monthsLeft !== null ? monthsLeft + ' mo' : '—'}</div>
                <div class="gstat-lbl">Est. time</div>
              </div>
              <div class="goal-stat">
                <div class="gstat-val">${fmtCurrency(g.monthlyContribution || monthlyNeeded, currency)}</div>
                <div class="gstat-lbl">Need/mo</div>
              </div>
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
    </div>

  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthsBetween(a, b) {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth()
}

// ── Event Listeners ───────────────────────────────────────────────────────────

function attachEventListeners() {
  const { profile, categories, transactions, goals } = state.data

  // Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view))
  })

  // Dashboard add tx button
  document.getElementById('add-tx-btn-dash')?.addEventListener('click', () => navigate('transactions'))

  // Budget: salary edit
  document.getElementById('edit-salary-btn')?.addEventListener('click', openSalaryModal)
  document.getElementById('set-currency-btn')?.addEventListener('click', openCurrencyModal)

  // Budget: rule wizard
  document.querySelectorAll('[data-rule]').forEach(btn => {
    btn.addEventListener('click', () => applyRule(btn.dataset.rule))
  })

  // Budget: category input changes
  document.querySelectorAll('.cbr-input').forEach(input => {
    input.addEventListener('input', debounce(e => {
      const catId = e.target.dataset.cat
      const val = parseFloat(e.target.value) || 0
      const cat = state.data.categories.find(c => c.id === catId)
      if (cat) { cat.budget = val; saveData(); render() }
    }, 400))
  })

  // Transactions: quick add
  document.getElementById('qa-submit')?.addEventListener('click', addQuickTransaction)
  document.getElementById('qa-amount')?.addEventListener('keydown', e => { if (e.key === 'Enter') addQuickTransaction() })

  // Transactions: filters
  document.getElementById('tx-search')?.addEventListener('input', debounce(e => {
    state.txFilter.search = e.target.value; render()
  }, 300))
  document.getElementById('tx-cat-filter')?.addEventListener('change', e => {
    state.txFilter.category = e.target.value; render()
  })
  document.getElementById('tx-month-filter')?.addEventListener('change', e => {
    state.txFilter.month = e.target.value; render()
  })

  // Transactions: delete
  document.querySelectorAll('[data-tx-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.txDel
      state.data.transactions = state.data.transactions.filter(t => t.id !== id)
      saveData(); render()
    })
  })

  // Forecast: scenario sliders
  document.querySelectorAll('.sim-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      state.simAdjust[e.target.dataset.simCat] = parseInt(e.target.value)
      render()
    })
  })

  // Goals
  document.getElementById('add-goal-btn')?.addEventListener('click', openGoalModal)
  document.getElementById('add-goal-card-btn')?.addEventListener('click', openGoalModal)
  document.querySelectorAll('[data-deposit]').forEach(btn => {
    btn.addEventListener('click', () => openDepositModal(btn.dataset.deposit))
  })
  document.querySelectorAll('[data-edit-goal]').forEach(btn => {
    btn.addEventListener('click', () => openGoalModal(btn.dataset.editGoal))
  })
  document.querySelectorAll('[data-del-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this goal?')) {
        state.data.goals = state.data.goals.filter(g => g.id !== btn.dataset.delGoal)
        saveData(); render()
      }
    })
  })

  // Draw forecast chart
  if (state.view === 'forecast' && state._forecastChartData) {
    requestAnimationFrame(() => {
      const { chartLabels, chartActualData, chartForecastData, forecastStart } = state._forecastChartData
      const fc = document.getElementById('forecast-line-chart')
      if (fc) {
        drawLineChart(fc, chartLabels, [
          { data: chartActualData, color: '#10b981', label: 'Actual', fill: true },
          { data: chartForecastData, color: '#8b5cf6', label: 'Forecast', dashed: true, dotRadius: 3 }
        ], { forecastStart })
      }
    })
  }

  // Draw goal rings
  if (state.view === 'goals') {
    requestAnimationFrame(() => {
      state.data.goals.forEach(g => {
        const canvas = document.getElementById(`goal-ring-${g.id}`)
        if (canvas) {
          const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0
          drawRing(canvas, pct, g.color || '#10b981', { lineWidth: 10, padding: 6 })
        }
      })
    })
  }

  // Draw dashboard charts after DOM is ready
  if (state.view === 'dashboard') {
    requestAnimationFrame(() => {
      const barCanvas = document.getElementById('bar-chart')
      if (barCanvas) {
        const last6 = getLastNMonths(6)
        const spendByMonth = getSpendingByMonth(transactions)
        const totalBudget = categories.filter(c => c.id !== 'savings').reduce((s, c) => s + c.budget, 0)
        drawBarChart(barCanvas, last6.map(m => monthLabel(m)), [
          { data: last6.map(m => spendByMonth[m] || 0), color: '#6366f1', label: 'Actual' },
          { data: last6.map(() => totalBudget), color: '#10b981' + '44', label: 'Budget' },
        ])
      }
      const donutCanvas = document.getElementById('donut-chart')
      if (donutCanvas) {
        const spendCur = getSpendingByCategory(transactions, getCurrentMonthKey())
        const slices = categories
          .filter(c => spendCur[c.id] > 0)
          .map(c => ({ value: spendCur[c.id], color: c.color }))
        drawDonutChart(donutCanvas, slices)
      }
      const healthCanvas = document.getElementById('health-ring')
      if (healthCanvas) {
        const { score } = calcHealthScore(state.data)
        const color = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444'
        drawRing(healthCanvas, score / 100, color, { lineWidth: 10, padding: 6 })
      }
    })
  }
}

function addQuickTransaction() {
  const desc = document.getElementById('qa-desc')?.value.trim()
  const amount = parseFloat(document.getElementById('qa-amount')?.value)
  const category = document.getElementById('qa-cat')?.value
  const date = document.getElementById('qa-date')?.value
  const type = document.getElementById('qa-type')?.value

  if (!amount || isNaN(amount) || amount <= 0) {
    document.getElementById('qa-amount')?.focus()
    return
  }

  state.data.transactions.push({ id: uuid(), description: desc || '', amount, category, date, type: type || 'expense' })
  saveData()
  state.txFilter.month = getMonthKey(date)
  render()
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(html) {
  const root = document.getElementById('modal-root')
  root.innerHTML = `<div class="modal-backdrop" id="modal-bg">${html}</div>`
  root.querySelector('#modal-bg').addEventListener('click', e => {
    if (e.target.id === 'modal-bg') closeModal()
  })
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = ''
}

function openSalaryModal() {
  const { profile } = state.data
  const salary = profile.salaryNet || ''
  openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Set Your Salary</div>
        <button class="modal-close" id="close-modal">×</button>
      </div>
      <div class="salary-input-hero">
        <div class="sih-icon">💼</div>
        <div class="sih-label">Monthly Net Take-Home</div>
        <input class="salary-big-input" id="salary-input" type="number" value="${salary}" placeholder="0" autofocus>
      </div>
      <div class="salary-divider">50/30/20 Preview</div>
      <div class="rule-preview" id="rule-preview">
        ${renderRulePreview(salary || 0, profile.currency)}
      </div>
      <div class="field" style="margin-top:16px;">
        <label class="field-label">Your name (optional)</label>
        <input class="field-input" id="name-input" type="text" value="${profile.name}" placeholder="e.g. Elena">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal-btn">Cancel</button>
        <button class="btn btn-primary" id="save-salary-btn">Save Salary</button>
      </div>
    </div>`)

  document.getElementById('close-modal')?.addEventListener('click', closeModal)
  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal)
  document.getElementById('salary-input')?.addEventListener('input', e => {
    document.getElementById('rule-preview').innerHTML = renderRulePreview(parseFloat(e.target.value) || 0, profile.currency)
  })
  document.getElementById('save-salary-btn')?.addEventListener('click', () => {
    const val = parseFloat(document.getElementById('salary-input').value)
    const name = document.getElementById('name-input').value.trim()
    if (val > 0) {
      state.data.profile.salaryNet = val
      state.data.profile.name = name
      state.data.profile.updatedAt = new Date().toISOString()
      saveData(); closeModal(); render()
    }
  })
}

function renderRulePreview(salary, currency = '€') {
  return `
    <div class="rule-card needs">
      <div class="rc-label">Needs</div>
      <div class="rc-pct" style="color:#92400e">50%</div>
      <div class="rc-amount">${fmtCurrencyFull(salary * 0.5, currency)}</div>
    </div>
    <div class="rule-card wants">
      <div class="rc-label">Wants</div>
      <div class="rc-pct" style="color:#1d4ed8">30%</div>
      <div class="rc-amount">${fmtCurrencyFull(salary * 0.3, currency)}</div>
    </div>
    <div class="rule-card saves">
      <div class="rc-label">Savings</div>
      <div class="rc-pct" style="color:#047857">20%</div>
      <div class="rc-amount">${fmtCurrencyFull(salary * 0.2, currency)}</div>
    </div>`
}

function openCurrencyModal() {
  const cur = state.data.profile.currency
  openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Select Currency</div>
        <button class="modal-close" id="close-modal">×</button>
      </div>
      <div class="field">
        <label class="field-label">Currency Symbol</label>
        <select class="field-input" id="currency-select">
          ${['€', '£', '$', '¥', '₹', 'Fr', 'kr'].map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal">Cancel</button>
        <button class="btn btn-primary" id="save-currency-btn">Save</button>
      </div>
    </div>`)
  document.querySelectorAll('#close-modal').forEach(b => b.addEventListener('click', closeModal))
  document.getElementById('save-currency-btn')?.addEventListener('click', () => {
    state.data.profile.currency = document.getElementById('currency-select').value
    saveData(); closeModal(); render()
  })
}

function openGoalModal(editId) {
  const existing = editId ? state.data.goals.find(g => g.id === editId) : null
  const icons = ['🎯','🏖️','🏠','🚗','🎓','✈️','💍','🏋️','🛡️','🎸','💻','🌍']
  const colors = ['#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

  openModal(`
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${existing ? 'Edit Goal' : 'New Savings Goal'}</div>
        <button class="modal-close" id="close-modal">×</button>
      </div>
      <div class="field-row" style="margin-bottom:12px;">
        <div class="field">
          <label class="field-label">Goal Name</label>
          <input class="field-input" id="g-name" type="text" value="${existing?.name || ''}" placeholder="e.g. Emergency Fund">
        </div>
        <div class="field">
          <label class="field-label">Target Amount</label>
          <input class="field-input" id="g-target" type="number" value="${existing?.target || ''}" placeholder="5000">
        </div>
      </div>
      <div class="field-row" style="margin-bottom:12px;">
        <div class="field">
          <label class="field-label">Current Saved</label>
          <input class="field-input" id="g-current" type="number" value="${existing?.current || ''}" placeholder="0">
        </div>
        <div class="field">
          <label class="field-label">Monthly Contribution</label>
          <input class="field-input" id="g-monthly" type="number" value="${existing?.monthlyContribution || ''}" placeholder="200">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Deadline (optional)</label>
        <input class="field-input" id="g-deadline" type="date" value="${existing?.deadline || ''}">
      </div>
      <div class="field">
        <label class="field-label">Icon</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          ${icons.map(ic => `<span class="icon-pick ${ic === (existing?.icon||'🎯') ? 'selected' : ''}" data-icon="${ic}" style="font-size:22px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${ic === (existing?.icon||'🎯') ? '#10b981' : 'transparent'}">${ic}</span>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field-label">Color</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          ${colors.map(c => `<div class="color-pick ${c === (existing?.color||'#10b981') ? 'selected' : ''}" data-color="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === (existing?.color||'#10b981') ? '#0f172a' : 'transparent'}"></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal-btn">Cancel</button>
        <button class="btn btn-primary" id="save-goal-btn">${existing ? 'Update Goal' : 'Create Goal'}</button>
      </div>
    </div>`)

  let selectedIcon = existing?.icon || '🎯'
  let selectedColor = existing?.color || '#10b981'

  document.getElementById('close-modal')?.addEventListener('click', closeModal)
  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal)

  document.querySelectorAll('.icon-pick').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.icon-pick').forEach(e => { e.style.borderColor = 'transparent' })
      el.style.borderColor = '#10b981'
      selectedIcon = el.dataset.icon
    })
  })
  document.querySelectorAll('.color-pick').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-pick').forEach(e => { e.style.borderColor = 'transparent' })
      el.style.borderColor = '#0f172a'
      selectedColor = el.dataset.color
    })
  })

  document.getElementById('save-goal-btn')?.addEventListener('click', () => {
    const name = document.getElementById('g-name').value.trim()
    const target = parseFloat(document.getElementById('g-target').value)
    if (!name || !target) return
    const goal = {
      id: existing?.id || uuid(),
      name,
      target,
      current: parseFloat(document.getElementById('g-current').value) || 0,
      monthlyContribution: parseFloat(document.getElementById('g-monthly').value) || 0,
      deadline: document.getElementById('g-deadline').value || null,
      icon: selectedIcon,
      color: selectedColor,
    }
    if (existing) {
      const idx = state.data.goals.findIndex(g => g.id === existing.id)
      state.data.goals[idx] = goal
    } else {
      state.data.goals.push(goal)
    }
    saveData(); closeModal(); render()
  })
}

function openDepositModal(goalId) {
  const goal = state.data.goals.find(g => g.id === goalId)
  if (!goal) return
  openModal(`
    <div class="modal" style="max-width:380px;">
      <div class="modal-header">
        <div class="modal-title">${goal.icon} Deposit to ${goal.name}</div>
        <button class="modal-close" id="close-modal">×</button>
      </div>
      <div class="field">
        <label class="field-label">Amount to deposit</label>
        <input class="field-input" id="deposit-amount" type="number" placeholder="0.00" autofocus>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">
        Current: ${fmtCurrencyFull(goal.current, state.data.profile.currency)} /
        Target: ${fmtCurrencyFull(goal.target, state.data.profile.currency)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal-btn">Cancel</button>
        <button class="btn btn-primary" id="save-deposit-btn">+ Add</button>
      </div>
    </div>`)
  document.getElementById('close-modal')?.addEventListener('click', closeModal)
  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal)
  document.getElementById('save-deposit-btn')?.addEventListener('click', () => {
    const amt = parseFloat(document.getElementById('deposit-amount').value)
    if (amt > 0) {
      goal.current = Math.min(goal.target, goal.current + amt)
      saveData(); closeModal(); render()
    }
  })
}

// ── Rule wizard ───────────────────────────────────────────────────────────────

function applyRule(rule) {
  const salary = state.data.profile.salaryNet
  if (!salary) { openSalaryModal(); return }

  const rules = {
    '503020': { housing:0.25, food:0.10, transport:0.05, utilities:0.05, health:0.05, shopping:0.08, entertainment:0.07, subscriptions:0.05, savings:0.20, education:0.05, other:0.05 },
    '702010': { housing:0.28, food:0.12, transport:0.08, utilities:0.06, health:0.06, shopping:0.08, entertainment:0.06, subscriptions:0.04, savings:0.20, education:0.02, other:0.00 },
    '601030': { housing:0.22, food:0.10, transport:0.07, utilities:0.05, health:0.06, shopping:0.05, entertainment:0.05, subscriptions:0.03, savings:0.30, education:0.05, other:0.02 },
  }
  const allocation = rules[rule]
  if (!allocation) return
  state.data.categories.forEach(c => {
    c.budget = Math.round(salary * (allocation[c.id] || 0))
  })
  saveData(); render()
}

// ── Debounce ──────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// ── Forecast Hero render fix ───────────────────────────────────────────────────

function renderForecastHero(fhMonths) {
  return fhMonths.map((m, i) => {
    return `<div class="fhmc-label">${monthLabel(m)}</div>`
  }).join('')
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const saved = await window.budget.load()
  if (saved) {
    const merged = defaultData()
    if (saved.profile) Object.assign(merged.profile, saved.profile)
    if (saved.categories) {
      saved.categories.forEach(sc => {
        const existing = merged.categories.find(c => c.id === sc.id)
        if (existing) Object.assign(existing, sc)
      })
    }
    if (saved.transactions) merged.transactions = saved.transactions
    if (saved.goals) merged.goals = saved.goals
    state.data = merged
  }
  state.selectedMonth = getCurrentMonthKey()
  state.txFilter.month = getCurrentMonthKey()
  render()
}

init()
