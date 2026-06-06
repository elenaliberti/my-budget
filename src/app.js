// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ['£','€','$','¥','₹','Fr','kr','A$','C$','CHF','zł','R$']

const FUN_QUOTES = [
  'Every pound planned is a step toward freedom 🦋',
  'You\'re not just budgeting — you\'re building your future 🏗️',
  'Financial anxiety? We\'re turning that into financial clarity ✨',
  'Small plans, big dreams. You\'ve got this 🚀',
  'Money is a tool — you\'re the boss 👑',
  'Past you made a budget. Future you says thank you 💌',
]

const MOOD_EMOJIS = { excellent: '🤩', good: '😊', fair: '😌', poor: '😬' }

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  view: 'overview',
  data: defaultData(),
  planMonth: getCurrentMonthKey(),
  _draftBudget: null,   // in-progress edits for Month Plan
}

async function saveData() { await window.budget.save(state.data) }

// ── Currency helpers ──────────────────────────────────────────────────────────

function profCur()   { return state.data.profile.currency }
function loanCur(l)  { return l?.currency || profCur() }
function goalCur(g)  { return g?.currency || profCur() }
function c(amount, currency) { return fmtCurrencyFull(amount, currency || profCur()) }
function cs(amount, currency) { return fmtCurrency(amount, currency || profCur()) }

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(view) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view))
  state.view = view
  render()
}

// ── Main render ───────────────────────────────────────────────────────────────

function render() {
  const container = document.getElementById('view-container')
  const hasSalary = state.data.profile.salaryNet > 0

  updateSidebar()

  if (!hasSalary && state.view !== 'plan') {
    container.innerHTML = renderSetupPrompt()
    container.querySelector('#go-setup-btn')?.addEventListener('click', () => navigate('plan'))
    return
  }

  switch (state.view) {
    case 'overview': container.innerHTML = renderOverview(); break
    case 'plan':     container.innerHTML = renderMonthPlan(); break
    case 'history':  container.innerHTML = renderHistory(); break
    case 'goals':    container.innerHTML = renderGoals();   break
    case 'loans':    container.innerHTML = renderLoans();   break
  }
  attachDynamicListeners()
}

function updateSidebar() {
  const { profile } = state.data
  document.getElementById('sidebar-salary').textContent =
    profile.salaryNet > 0 ? c(profile.salaryNet, profCur()) : '—'
  const { score } = calcHealthScore(state.data)
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
  const el = document.getElementById('sidebar-score')
  if (el) el.textContent = score ? `${score}/100 ${MOOD_EMOJIS[grade]}` : '—'
}

// ── Setup Prompt ──────────────────────────────────────────────────────────────

function renderSetupPrompt() {
  return `
    <div class="setup-prompt">
      <div class="sp-icon">✨</div>
      <div class="sp-title">Hey! Let's set up your budget 🎉</div>
      <div class="sp-sub">No stress — just tell me your monthly take-home and we'll figure out the rest together. Budgeting can actually feel good, I promise.</div>
      <button id="go-setup-btn" class="btn btn-primary" style="font-size:15px;padding:13px 36px;">Let's go! →</button>
    </div>`
}

// ── Overview ──────────────────────────────────────────────────────────────────

function renderOverview() {
  const { profile, goals, loans } = state.data
  const cur = getCurrentMonthKey()
  const budget = getOrCreateMonthBudget(state.data, cur)
  const income = budget.income || profile.salaryNet
  const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(state.data, budget)
  const { score, breakdown } = calcHealthScore(state.data)
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
  const gradeLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work'
  const isSaved = state.data.monthlyBudgets.some(b => b.month === cur)
  const insights = generateInsights(state.data)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = profile.name || 'you'
  const quote = FUN_QUOTES[new Date().getDate() % FUN_QUOTES.length]

  // Debt total remaining
  const totalDebtEur = loans.reduce((s, l) => {
    const repaid = (l.payments || []).reduce((a, p) => a + p.amount, 0)
    return s + Math.max(0, l.totalDebt - repaid)
  }, 0)

  // Goals summary
  const totalGoalTarget  = goals.reduce((s, g) => s + g.target, 0)
  const totalGoalCurrent = goals.reduce((s, g) => s + g.current, 0)
  const goalsPct = totalGoalTarget > 0 ? totalGoalCurrent / totalGoalTarget : 0

  // On-track analysis
  const catPct   = income > 0 ? Math.round(catTotal  / income * 100) : 0
  const goalPct  = income > 0 ? Math.round(goalTotal  / income * 100) : 0
  const debtPct  = income > 0 ? Math.round(debtTotal  / income * 100) : 0
  const freePct  = income > 0 ? Math.round(remaining  / income * 100) : 0

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">${greeting}, ${name}! ${MOOD_EMOJIS[grade]}</div>
          <div class="page-sub">${monthLabelLong(cur)} · ${quote}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="go-plan-btn">📋 Open Month Plan</button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card sc-income">
        <div class="stat-icon">💰</div>
        <div class="stat-val">${cs(income, profCur())}</div>
        <div class="stat-lbl">Income This Month</div>
        <div class="stat-delta neu">${isSaved ? '✅ Plan saved' : '📋 Draft — not saved yet'}</div>
      </div>
      <div class="stat-card sc-spent">
        <div class="stat-icon">📊</div>
        <div class="stat-val">${cs(totalCommitted, profCur())}</div>
        <div class="stat-lbl">Total Committed</div>
        <div class="stat-delta neu">Living + goals + debt</div>
      </div>
      <div class="stat-card ${remaining >= 0 ? 'sc-remain' : 'sc-spent'}">
        <div class="stat-icon">${remaining >= 0 ? '✅' : '⚠️'}</div>
        <div class="stat-val ${remaining < 0 ? 'text-red' : 'text-emerald'}">${cs(Math.abs(remaining), profCur())}</div>
        <div class="stat-lbl">${remaining >= 0 ? 'Free / Unplanned' : 'Over Your Income'}</div>
        <div class="stat-delta ${remaining >= 0 ? 'pos' : 'neg'}">${remaining >= 0 ? 'Breathing room 🎉' : 'Adjust your plan 🤏'}</div>
      </div>
      <div class="stat-card sc-savings">
        <div class="stat-icon">🐖</div>
        <div class="stat-val ${goalPct >= 10 ? 'text-emerald' : ''}">${goalPct}%</div>
        <div class="stat-lbl">Into Goals</div>
        <div class="stat-delta ${goalPct >= 20 ? 'pos' : goalPct >= 10 ? 'neu' : 'neg'}">${goalPct >= 20 ? 'Killing it! 🔥' : goalPct >= 10 ? 'Solid, aim for 20%' : 'Room to grow 🌱'}</div>
      </div>
    </div>

    <div class="grid-col-7-5 mb20">
      <div class="card">
        <div class="card-title">How your money is split this month</div>
        <div class="money-split">
          ${[
            { label: '🏠 Living', amount: catTotal, pct: catPct, color: '#7c3aed' },
            { label: '🏆 Goals',  amount: goalTotal, pct: goalPct, color: '#10b981' },
            { label: '📉 Debt',   amount: debtTotal, pct: debtPct, color: '#f43f5e' },
            { label: '✨ Free',   amount: Math.max(0, remaining), pct: Math.max(0, freePct), color: '#0ea5e9' },
          ].map(row => `
            <div class="split-row">
              <div class="split-label">${row.label}</div>
              <div class="split-bar-track">
                <div class="split-bar-fill" style="width:${row.pct}%;background:${row.color}"></div>
              </div>
              <div class="split-pct" style="color:${row.color}">${row.pct}%</div>
              <div class="split-amount">${c(row.amount, profCur())}</div>
            </div>`).join('')}
        </div>
        <div class="split-total">
          <span>Total income: <strong>${c(income, profCur())}</strong></span>
          <span class="${remaining >= 0 ? 'text-emerald' : 'text-red'}">${remaining >= 0 ? '✅ Balanced' : '⚠️ Over by ' + c(Math.abs(remaining), profCur())}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Financial Health — ${score}/100</div>
        <div class="health-score-wrap">
          <div class="health-score-ring">
            <canvas id="health-ring" style="width:90px;height:90px;"></canvas>
          </div>
          <div class="health-score-info">
            <div class="hs-score" style="color:${score>=80?'#10b981':score>=60?'#7c3aed':score>=40?'#f59e0b':'#f43f5e'}">${score}</div>
            <div class="hs-label">out of 100</div>
            <div class="hs-grade grade-${grade}">${MOOD_EMOJIS[grade]} ${gradeLabel}</div>
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

    <div class="grid-2 mb20">
      <div class="card">
        <div class="card-title">📉 Debt Situation</div>
        ${loans.length === 0 ? `
          <div class="empty-state" style="padding:20px">
            <div class="empty-icon">🎉</div>
            <div class="empty-sub">No debt tracked. Amazing!</div>
          </div>` : loans.map(loan => {
            const repaid = (loan.payments||[]).reduce((s,p)=>s+p.amount,0)
            const balance = Math.max(0, loan.totalDebt - repaid)
            const pct = loan.totalDebt > 0 ? Math.round(repaid/loan.totalDebt*100) : 0
            const lCur = loanCur(loan)
            const payGBP = loan.monthlyPayment || 0
            const payEUR = payGBP > 0 && lCur !== profCur() ? convertPayment(state.data, payGBP, profCur(), lCur) : 0
            const monthsLeft = payGBP > 0 && balance > 0 ? Math.ceil(balance / (payGBP > 0 && lCur !== profCur() ? payEUR : payGBP)) : null
            return `
              <div class="debt-overview-row">
                <div class="dor-name">${loan.name}</div>
                <div class="dor-balance">${c(balance, lCur)} left</div>
                <div class="dor-bar-track"><div class="dor-bar-fill" style="width:${pct}%"></div></div>
                <div class="dor-meta">
                  ${pct}% repaid ·
                  ${payGBP > 0 ? `${c(payGBP, profCur())}/mo` : 'No monthly payment set'}
                  ${payEUR > 0 ? ` → ${c(payEUR, lCur)} received` : ''}
                  ${monthsLeft ? ` · ~${monthsLeft} months left` : ''}
                </div>
              </div>`
          }).join('')}
      </div>
      <div class="card">
        <div class="card-title">💡 Situation Check</div>
        <div class="insight-list">
          ${insights.map(i => `
            <div class="insight-item ${i.type}">
              <span class="insight-icon">${i.icon}</span>
              <span>${i.text}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    ${goals.length > 0 ? `
    <div class="card mb20">
      <div class="card-title">🏆 Goals at a Glance</div>
      <div class="goals-overview-grid">
        ${goals.map(g => {
          const gCur = goalCur(g)
          const pct = g.target > 0 ? Math.min(100, Math.round(g.current/g.target*100)) : 0
          const remaining2 = g.target - g.current
          const monthsLeft = g.monthlyContribution > 0 ? Math.ceil(remaining2/g.monthlyContribution) : null
          return `
            <div class="goal-overview-card">
              <div class="goc-icon">${g.icon||'🎯'}</div>
              <div class="goc-info">
                <div class="goc-name">${g.name}</div>
                <div class="goc-bar-track"><div class="goc-bar-fill" style="width:${pct}%;background:${g.color||'#10b981'}"></div></div>
                <div class="goc-meta">${c(g.current,gCur)} / ${c(g.target,gCur)} · ${pct}%${monthsLeft?` · ~${monthsLeft} mo`:''}</div>
              </div>
            </div>`
        }).join('')}
      </div>
    </div>` : ''}
  `
}

// ── Month Plan ────────────────────────────────────────────────────────────────

function renderMonthPlan() {
  const { profile, categories, goals, loans } = state.data
  const month = state.planMonth
  const isCurrentMonth = month === getCurrentMonthKey()

  // Use draft if editing, otherwise load saved or create from template
  if (!state._draftBudget || state._draftBudget.month !== month) {
    state._draftBudget = getOrCreateMonthBudget(state.data, month)
  }
  const draft = state._draftBudget
  const income = draft.income || 0
  const isSaved = state.data.monthlyBudgets.some(b => b.month === month)

  const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(state.data, draft)
  const pctUsed = income > 0 ? Math.min(100, Math.round(totalCommitted/income*100)) : 0
  const over = totalCommitted > income

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title" style="display:flex;align-items:center;gap:12px;">
            Month Plan
            <div class="month-nav">
              <button class="month-nav-btn" id="plan-prev-month">←</button>
              <span class="month-nav-label">${monthLabelLong(month)}</span>
              <button class="month-nav-btn" id="plan-next-month" ${isCurrentMonth ? 'disabled' : ''}>→</button>
              ${!isCurrentMonth ? `<button class="month-nav-today" id="plan-today">Today</button>` : ''}
            </div>
          </div>
          <div class="page-sub">${isSaved ? '✅ Plan saved' : '✏️ Unsaved draft — hit Save when ready'}</div>
        </div>
        <button class="btn btn-primary" id="save-plan-btn">💾 Save Plan</button>
      </div>
    </div>

    <div class="plan-income-card mb20">
      <div class="pic-label">💰 Income for ${monthLabel(month)}</div>
      <div class="pic-input-row">
        <div class="pic-currency">${profCur()}</div>
        <input type="number" id="plan-income" class="pic-input" value="${income || ''}" placeholder="0" min="0">
        <div class="pic-hint">
          ${profile.salaryNet > 0 ? `Default: ${c(profile.salaryNet, profCur())}` : 'Set your default salary in settings'}
          ${income !== profile.salaryNet && profile.salaryNet > 0 ? ' · <span style="color:var(--amber);font-weight:700;">Custom this month</span>' : ''}
        </div>
      </div>
    </div>

    <div class="plan-progress-wrap mb20">
      <div class="plan-progress-bar">
        <div class="plan-progress-fill ${over ? 'over' : pctUsed > 95 ? 'near' : ''}" style="width:${pctUsed}%"></div>
      </div>
      <div class="plan-progress-labels">
        <span>${cs(totalCommitted, profCur())} planned</span>
        <span class="${over ? 'text-red' : 'text-emerald'}">${over ? '⚠️ ' + cs(Math.abs(remaining), profCur()) + ' over' : '✅ ' + cs(remaining, profCur()) + ' free'}</span>
      </div>
    </div>

    <div class="plan-wizard-row mb20">
      <span class="plan-wizard-label">✨ Auto-fill with a rule:</span>
      <div class="rw-btns">
        <button class="rw-btn" data-rule="503020">50/30/20</button>
        <button class="rw-btn" data-rule="702010">70/20/10</button>
        <button class="rw-btn" data-rule="601030">60/10/30</button>
      </div>
    </div>

    <div class="plan-sections">

      <div class="plan-section">
        <div class="plan-section-header">
          <div class="psh-title">🏠 Living Expenses</div>
          <div class="psh-total">${c(catTotal, profCur())}</div>
        </div>
        ${categories.map(cat => {
          const val = draft.allocations[cat.id] || 0
          const pct = income > 0 && val > 0 ? Math.round(val/income*100) : 0
          return `
            <div class="plan-cat-row">
              <div class="pcr-icon" data-edit-cat="${cat.id}" style="cursor:pointer">${cat.icon}</div>
              <div class="pcr-info">
                <div class="pcr-name">${cat.name}${cat.essential ? ' <span class="pcr-essential">need</span>' : ''}</div>
                ${pct > 0 ? `<div class="pcr-pct">${pct}% of income</div>` : ''}
              </div>
              <button class="pcr-del" data-edit-cat="${cat.id}" title="Edit">✏️</button>
              <button class="pcr-del" data-del-cat="${cat.id}" title="Delete">🗑️</button>
              <div class="pcr-input-wrap">
                <span class="pcr-currency">${profCur()}</span>
                <input type="number" class="plan-cat-input" data-cat="${cat.id}" value="${val || ''}" placeholder="0" min="0" step="10">
              </div>
            </div>`
        }).join('')}
        <button class="add-cat-btn" id="add-cat-btn">＋ Add category</button>
      </div>

      ${goals.length > 0 ? `
      <div class="plan-section plan-section-goals">
        <div class="plan-section-header">
          <div class="psh-title">🏆 Goal Contributions <span class="psh-auto-badge">editable per month</span></div>
          <div class="psh-total text-emerald">${c(goalTotal, profCur())}</div>
        </div>
        ${goals.map(g => {
          const defaultContrib = g.monthlyContribution || 0
          const govKey = (draft.goalOverrides || {})[g.id]
          const currentVal = govKey !== undefined ? govKey : defaultContrib
          const isOverridden = govKey !== undefined && govKey !== defaultContrib
          const remaining2 = g.target - g.current
          const monthsAtCurrent = currentVal > 0 ? Math.ceil(remaining2/currentVal) : null
          return `
            <div class="plan-cat-row">
              <div class="pcr-icon">${g.icon||'🎯'}</div>
              <div class="pcr-info">
                <div class="pcr-name">${g.name}</div>
                <div class="pcr-pct">${Math.round((g.current/g.target)*100)}% saved${monthsAtCurrent?' · ~'+monthsAtCurrent+' months left':''}${isOverridden?' · <span style="color:var(--amber);font-weight:700">custom this month</span> (default '+c(defaultContrib,profCur())+')':' · default: '+c(defaultContrib,profCur())}</div>
              </div>
              <div class="pcr-input-wrap">
                <span class="pcr-currency">${profCur()}</span>
                <input type="number" class="plan-cat-input plan-goal-input" data-goal="${g.id}" value="${currentVal || ''}" placeholder="0" min="0" step="10">
              </div>
            </div>`
        }).join('')}
        <div class="plan-section-note">💡 Set to 0 to skip this goal for the month. Changes here only affect ${monthLabel(month)}.</div>
      </div>` : `
      <div class="plan-section-empty" id="add-goals-prompt">
        <span>🏆 No goals set up yet —</span>
        <a href="#" id="go-goals-link">add some goals</a> and they'll appear here automatically.
      </div>`}

      ${loans.length > 0 ? `
      <div class="plan-section plan-section-debt">
        <div class="plan-section-header">
          <div class="psh-title">📉 Debt Repayments <span class="psh-auto-badge">editable per month</span></div>
          <div class="psh-total text-red">${c(debtTotal, profCur())}</div>
        </div>
        ${loans.map(loan => {
          const lCur = loanCur(loan)
          const isCross = lCur !== profCur()
          const defaultPayInProfile = loanMonthlyInProfileCurrency(state.data, loan)
          const dov = (draft.debtOverrides || {})[loan.id]
          const currentVal = dov !== undefined ? dov : defaultPayInProfile
          const isOverridden = dov !== undefined && Math.abs(dov - defaultPayInProfile) > 0.01
          const eurEquiv = isCross && currentVal ? convertPayment(state.data, currentVal, profCur(), lCur) : null
          return `
            <div class="plan-cat-row">
              <div class="pcr-icon">📉</div>
              <div class="pcr-info">
                <div class="pcr-name">${loan.name}${lCur !== profCur() ? ' <span class="cur-badge">'+lCur+'</span>' : ''}</div>
                <div class="pcr-pct">
                  ${loan.interestRate > 0 ? loan.interestRate + '% interest' : '0% interest free ✨'}
                  ${isCross && eurEquiv ? ` · → ${c(eurEquiv, lCur)} received` : ''}
                  ${isOverridden ? ' · <span style="color:var(--amber);font-weight:700">custom this month</span> (default '+c(defaultPayInProfile,profCur())+')' : ' · default: '+c(defaultPayInProfile,profCur())}
                </div>
              </div>
              <div class="pcr-input-wrap">
                <span class="pcr-currency">${profCur()}</span>
                <input type="number" class="plan-cat-input plan-debt-input" data-loan="${loan.id}" value="${currentVal || ''}" placeholder="0" min="0" step="10">
              </div>
            </div>`
        }).join('')}
        <div class="plan-section-note">💡 Pay extra this month? Increase the amount. Set to 0 to skip. Only affects ${monthLabel(month)}.</div>
      </div>` : ''}

      <div class="plan-summary-card ${over ? 'over' : remaining < income * 0.05 ? 'tight' : 'good'}">
        <div class="psc-row">
          <span class="psc-label">Total income</span>
          <span class="psc-val">${c(income, profCur())}</span>
        </div>
        <div class="psc-row">
          <span class="psc-label">Living expenses</span>
          <span class="psc-val">− ${c(catTotal, profCur())}</span>
        </div>
        ${goalTotal > 0 ? `<div class="psc-row"><span class="psc-label">Goal contributions</span><span class="psc-val">− ${c(goalTotal, profCur())}</span></div>` : ''}
        ${debtTotal > 0 ? `<div class="psc-row"><span class="psc-label">Debt repayments</span><span class="psc-val">− ${c(debtTotal, profCur())}</span></div>` : ''}
        <div class="psc-divider"></div>
        <div class="psc-row psc-result">
          <span class="psc-label">${remaining >= 0 ? '✅ Unplanned / Free' : '❌ Over income by'}</span>
          <span class="psc-val ${remaining >= 0 ? 'text-emerald' : 'text-red'}">${c(Math.abs(remaining), profCur())}</span>
        </div>
        ${remaining > 0 ? `<div class="psc-tip">💡 Consider routing this to savings or a goal!</div>` : ''}
        ${over ? `<div class="psc-tip" style="color:var(--red)">⚠️ Reduce some categories or check your income amount.</div>` : ''}
      </div>

    </div>

    <div class="field" style="margin-top:20px;">
      <label class="field-label">📝 Notes for ${monthLabel(month)}</label>
      <textarea id="plan-notes" class="field-input" rows="2" placeholder="e.g. Got a bonus, cut entertainment, visiting family…">${draft.notes || ''}</textarea>
    </div>

    <div style="display:flex;gap:12px;margin-top:8px;">
      <button class="btn btn-primary" id="save-plan-btn-2">💾 Save ${monthLabel(month)} Plan</button>
      ${isSaved ? `<button class="btn btn-danger btn-sm" id="delete-plan-btn">Delete plan</button>` : ''}
    </div>
  `
}

// ── History ───────────────────────────────────────────────────────────────────

function renderHistory() {
  const { monthlyBudgets, profile, goals, loans } = state.data
  const sorted = [...monthlyBudgets].sort((a,b) => b.month.localeCompare(a.month))

  return `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <div class="page-title">Budget History 📅</div>
          <div class="page-sub">${sorted.length} saved plan${sorted.length !== 1 ? 's' : ''} — your financial journey in snapshots</div>
        </div>
      </div>
    </div>

    ${sorted.length === 0 ? `
      <div class="empty-state" style="padding:80px 40px">
        <div class="empty-icon">📅</div>
        <div class="empty-title">No saved plans yet!</div>
        <div class="empty-sub">Go to <strong>Month Plan</strong>, fill in your budget, and hit Save. It'll show up here.</div>
        <button class="btn btn-primary" style="margin-top:20px;" id="go-plan-from-history">Start planning →</button>
      </div>` :
    `<div class="history-cards-grid">
      ${sorted.map(b => {
        const income = b.income || 0
        const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(state.data, b)
        const isOver = remaining < 0
        const pct = income > 0 ? Math.min(100, Math.round(totalCommitted/income*100)) : 0
        const isCurrent = b.month === getCurrentMonthKey()
        return `
          <div class="history-card" data-open-plan="${b.month}">
            <div class="hc-top">
              <div class="hc-month">${monthLabelLong(b.month)}</div>
              ${isCurrent ? '<span class="badge-now">now</span>' : ''}
              <div class="hc-status ${isOver ? 'over' : ''}">${isOver ? '⚠️ Over' : '✅ Balanced'}</div>
            </div>
            <div class="hc-income">${c(income, profCur())}</div>
            <div class="hc-income-label">income</div>
            <div class="hc-prog-bar"><div class="hc-prog-fill" style="width:${pct}%;background:${isOver?'var(--red)':'var(--primary)'}"></div></div>
            <div class="hc-breakdown">
              <span>🏠 ${cs(catTotal,profCur())}</span>
              ${goalTotal > 0 ? `<span>🏆 ${cs(goalTotal,profCur())}</span>` : ''}
              ${debtTotal > 0 ? `<span>📉 ${cs(debtTotal,profCur())}</span>` : ''}
              <span class="${isOver?'text-red':'text-emerald'}">${isOver?'−':'+'} ${cs(Math.abs(remaining),profCur())}</span>
            </div>
            ${b.notes ? `<div class="hc-notes">📝 ${b.notes}</div>` : ''}
          </div>`
      }).join('')}
    </div>`}
  `
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function renderGoals() {
  const { goals, profile } = state.data
  return `
    <div class="page-header">
      <div class="page-header-row">
        <div><div class="page-title">Savings Goals 🏆</div><div class="page-sub">${goals.length} active goal${goals.length!==1?'s':''}</div></div>
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
            <div style="position:absolute;top:0;left:0;right:0;height:4px;background:${g.color||'#10b981'};border-radius:var(--radius-lg) var(--radius-lg) 0 0;"></div>
            <div style="text-align:center;font-size:28px;margin-bottom:8px;">${g.icon||'🎯'}</div>
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
              <div class="goal-stat"><div class="gstat-val">${cs(remaining,cur)}</div><div class="gstat-lbl">Left</div></div>
              <div class="goal-stat"><div class="gstat-val">${monthsLeft!==null?monthsLeft+' mo':'—'}</div><div class="gstat-lbl">To go</div></div>
              <div class="goal-stat"><div class="gstat-val">${cs(g.monthlyContribution||0,profCur())}</div><div class="gstat-lbl">Per month</div></div>
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
  const { loans, profile } = state.data
  const rate = profile.gbpToEurRate || 1
  return `
    <div class="page-header">
      <div class="page-header-row">
        <div><div class="page-title">Debt Tracker 📉</div><div class="page-sub">Chipping away at it, one month at a time 💪</div></div>
        <button class="btn btn-primary btn-sm" id="add-loan-btn">+ Add Loan</button>
      </div>
    </div>

    <div class="rate-banner mb20">
      <span>💱 Exchange rate: <strong>£1 = €${rate.toFixed(4)}</strong></span>
      <button class="rate-edit-btn" id="edit-rate-btn">Update rate</button>
    </div>

    ${loans.length === 0 ? `
      <div class="add-loan-card" id="add-loan-card-btn" style="max-width:420px;margin:40px auto;">
        <div style="font-size:44px;">📉</div>
        <div style="font-size:15px;font-weight:700;">Add your first loan</div>
        <div style="font-size:13px;color:var(--text-muted);">Student loans, credit cards, mortgages…</div>
      </div>` :
    loans.map(loan => {
      const lCur = loanCur(loan)
      const isCross = lCur !== profCur()
      const totalRepaid = (loan.payments||[]).reduce((s,p) => s + (p.amount||0), 0)
      const balance = Math.max(0, loan.totalDebt - totalRepaid)
      const pct = loan.totalDebt > 0 ? totalRepaid/loan.totalDebt : 0
      const payInLoan    = loan.monthlyPayment || 0
      const payInProfile = loanMonthlyInProfileCurrency(state.data, loan)
      const monthsLeft   = payInLoan > 0 && balance > 0 ? Math.ceil(balance/payInLoan) : null

      // Total sent in GBP (for cross-currency loans)
      const totalSentGBP = (loan.payments||[]).reduce((s,p) => s + (p.sentAmount || 0), 0)

      return `
        <div class="loan-card mb20">
          <div class="loan-hero">
            <div class="loan-ring-wrap">
              <canvas id="loan-ring-${loan.id}" style="width:90px;height:90px;"></canvas>
              <div class="loan-ring-center"><div class="lrc-pct">${Math.round(pct*100)}%</div><div class="lrc-lbl">repaid</div></div>
            </div>
            <div class="loan-info">
              <div class="loan-name">${loan.name} ${isCross ? `<span class="cur-badge">${lCur}</span>` : ''}</div>
              <div class="loan-balance">${c(balance, lCur)}</div>
              <div class="loan-balance-label">remaining balance</div>
              ${isCross ? `<div class="loan-cross-info">You send <strong>${c(payInProfile, profCur())}/mo</strong> → they receive <strong>${c(payInLoan, lCur)}/mo</strong> at €${rate.toFixed(3)}/£</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-left:auto;">
              <button class="btn btn-primary btn-sm" data-pay-loan="${loan.id}">+ Payment</button>
              <button class="btn btn-secondary btn-sm" data-edit-loan="${loan.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del-loan="${loan.id}">Delete</button>
            </div>
          </div>
          <div class="loan-stats-row">
            <div class="loan-stat"><div class="lst-val">${cs(loan.totalDebt,lCur)}</div><div class="lst-lbl">Original</div></div>
            <div class="loan-stat"><div class="lst-val text-emerald">${cs(totalRepaid,lCur)}</div><div class="lst-lbl">Repaid</div></div>
            ${isCross ? `<div class="loan-stat"><div class="lst-val">${cs(totalSentGBP,profCur())}</div><div class="lst-lbl">Sent (${profCur()})</div></div>` : ''}
            <div class="loan-stat"><div class="lst-val ${loan.interestRate>0?'text-red':'text-emerald'}">${loan.interestRate>0?loan.interestRate+'%':'0% ✓'}</div><div class="lst-lbl">Interest</div></div>
          </div>
          <div class="loan-progress-bar"><div class="loan-progress-fill" style="width:${Math.round(pct*100)}%;background:${pct>=1?'#10b981':'var(--primary)'}"></div></div>
          <div class="loan-progress-label"><span>${cs(totalRepaid,lCur)} repaid</span><span>${cs(balance,lCur)} left</span></div>
          ${monthsLeft ? `<div class="loan-payoff-estimate">🎯 At ${c(payInLoan,lCur)}/month → debt-free in <strong>${monthsLeft} month${monthsLeft!==1?'s':''}</strong> (${addMonths(getCurrentMonthKey(),monthsLeft)})</div>` : ''}
          <div class="loan-payments-title">Payment History<span>${(loan.payments||[]).length} payment${(loan.payments||[]).length!==1?'s':''}</span></div>
          ${(loan.payments||[]).length > 0 ? `
            <div class="loan-payments-list">
              ${[...(loan.payments||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10).map(p => `
                <div class="loan-payment-row">
                  <div class="lpr-date">${new Date(p.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>
                  <div class="lpr-note">${p.note||'Payment'}</div>
                  ${p.sentAmount ? `<div class="lpr-sent">${c(p.sentAmount,profCur())} sent</div>` : ''}
                  <div class="lpr-amount">− ${c(p.amount,lCur)}</div>
                  <button class="lpr-del" data-del-payment="${loan.id}|${p.id}">✕</button>
                </div>`).join('')}
            </div>` : `<div class="empty-state" style="padding:20px"><div class="empty-sub">No payments yet.</div></div>`}
        </div>`
    }).join('')}
  `
}

// ── Event listeners ───────────────────────────────────────────────────────────

function attachDynamicListeners() {
  // Overview
  document.getElementById('go-plan-btn')?.addEventListener('click', () => navigate('plan'))
  document.getElementById('go-plan-from-history')?.addEventListener('click', () => navigate('plan'))

  // Month plan navigation
  document.getElementById('plan-prev-month')?.addEventListener('click', () => {
    state.planMonth = addMonths(state.planMonth, -1)
    state._draftBudget = null
    render()
  })
  document.getElementById('plan-next-month')?.addEventListener('click', () => {
    if (state.planMonth < getCurrentMonthKey()) {
      state.planMonth = addMonths(state.planMonth, 1)
      state._draftBudget = null
      render()
    }
  })
  document.getElementById('plan-today')?.addEventListener('click', () => {
    state.planMonth = getCurrentMonthKey()
    state._draftBudget = null
    render()
  })

  // Income field — update draft in real time
  document.getElementById('plan-income')?.addEventListener('input', e => {
    if (state._draftBudget) {
      state._draftBudget.income = parseFloat(e.target.value) || 0
      // Re-render progress bar only (avoids losing focus)
      updatePlanSummary()
    }
  })

  // Category inputs
  document.querySelectorAll('.plan-cat-input').forEach(input => {
    input.addEventListener('change', e => {
      if (!document.contains(e.target) || !state._draftBudget) return
      const val = parseFloat(e.target.value) || 0
      if (e.target.dataset.cat)  { state._draftBudget.allocations[e.target.dataset.cat] = val }
      if (e.target.dataset.goal) { if (!state._draftBudget.goalOverrides) state._draftBudget.goalOverrides = {}; state._draftBudget.goalOverrides[e.target.dataset.goal] = val }
      if (e.target.dataset.loan) { if (!state._draftBudget.debtOverrides) state._draftBudget.debtOverrides = {}; state._draftBudget.debtOverrides[e.target.dataset.loan] = val }
      updatePlanSummary()
    })
  })

  // Notes
  document.getElementById('plan-notes')?.addEventListener('input', e => {
    if (state._draftBudget) state._draftBudget.notes = e.target.value
  })

  // Save plan buttons
  const savePlan = () => {
    if (!state._draftBudget) return
    const draft = state._draftBudget
    draft.savedAt = new Date().toISOString()
    if (!draft.id) draft.id = uuid()
    const idx = state.data.monthlyBudgets.findIndex(b => b.month === draft.month)
    if (idx >= 0) state.data.monthlyBudgets[idx] = draft
    else state.data.monthlyBudgets.push(draft)
    // Also sync category template budgets from current month's plan
    if (draft.month === getCurrentMonthKey()) {
      state.data.categories.forEach(cat => {
        cat.budget = draft.allocations[cat.id] || 0
      })
    }
    saveData()
    showToast(`${monthLabelLong(draft.month)} plan saved! ✅`, 'success')
    render()
  }
  document.getElementById('save-plan-btn')?.addEventListener('click', savePlan)
  document.getElementById('save-plan-btn-2')?.addEventListener('click', savePlan)

  // Delete plan
  document.getElementById('delete-plan-btn')?.addEventListener('click', () => {
    if (confirm(`Delete the plan for ${monthLabelLong(state.planMonth)}?`)) {
      state.data.monthlyBudgets = state.data.monthlyBudgets.filter(b => b.month !== state.planMonth)
      state._draftBudget = null
      saveData(); render()
    }
  })

  // Wizard rules
  document.querySelectorAll('[data-rule]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state._draftBudget) return
      const income = state._draftBudget.income || state.data.profile.salaryNet
      if (!income) { openSalaryModal(); return }
      const tmpData = JSON.parse(JSON.stringify(state.data))
      applyAllocationRule(tmpData, btn.dataset.rule, income)
      tmpData.categories.forEach(cat => {
        state._draftBudget.allocations[cat.id] = cat.budget
      })
      render()
    })
  })

  // Category management
  document.getElementById('add-cat-btn')?.addEventListener('click', () => openCategoryModal())
  document.querySelectorAll('[data-edit-cat]').forEach(el => el.addEventListener('click', () => openCategoryModal(el.dataset.editCat)))
  document.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delCat
      const cat = state.data.categories.find(c => c.id === id)
      if (confirm(`Delete "${cat?.name}"?`)) {
        state.data.categories = state.data.categories.filter(c => c.id !== id)
        if (state._draftBudget) delete state._draftBudget.allocations[id]
        saveData(); render()
      }
    })
  })

  // History: open plan
  document.querySelectorAll('[data-open-plan]').forEach(card => {
    card.addEventListener('click', () => {
      state.planMonth = card.dataset.openPlan
      state._draftBudget = null
      navigate('plan')
    })
  })

  // Cross-links
  document.getElementById('go-goals-link')?.addEventListener('click', e => { e.preventDefault(); navigate('goals') })
  document.getElementById('go-loans-link')?.addEventListener('click', e => { e.preventDefault(); navigate('loans') })

  // Rate banner
  document.getElementById('edit-rate-btn')?.addEventListener('click', openRateModal)

  // Goals
  document.getElementById('add-goal-btn')?.addEventListener('click', openGoalModal)
  document.getElementById('add-goal-card-btn')?.addEventListener('click', openGoalModal)
  document.querySelectorAll('[data-deposit]').forEach(btn => btn.addEventListener('click', () => openDepositModal(btn.dataset.deposit)))
  document.querySelectorAll('[data-edit-goal]').forEach(btn => btn.addEventListener('click', () => openGoalModal(btn.dataset.editGoal)))
  document.querySelectorAll('[data-del-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this goal?')) { state.data.goals = state.data.goals.filter(g => g.id !== btn.dataset.delGoal); saveData(); render() }
    })
  })

  // Loans
  document.getElementById('add-loan-btn')?.addEventListener('click', () => openLoanModal())
  document.getElementById('add-loan-card-btn')?.addEventListener('click', () => openLoanModal())
  document.querySelectorAll('[data-pay-loan]').forEach(btn => btn.addEventListener('click', () => openLoanPaymentModal(btn.dataset.payLoan)))
  document.querySelectorAll('[data-edit-loan]').forEach(btn => btn.addEventListener('click', () => openLoanModal(btn.dataset.editLoan)))
  document.querySelectorAll('[data-del-loan]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this loan?')) { state.data.loans = state.data.loans.filter(l => l.id !== btn.dataset.delLoan); saveData(); render() }
    })
  })
  document.querySelectorAll('[data-del-payment]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [loanId, payId] = btn.dataset.delPayment.split('|')
      const loan = state.data.loans.find(l => l.id === loanId)
      if (loan) { loan.payments = (loan.payments||[]).filter(p => p.id !== payId); saveData(); render() }
    })
  })

  // Charts
  requestAnimationFrame(() => {
    if (state.view === 'overview') {
      const h = document.getElementById('health-ring')
      if (h) { const {score} = calcHealthScore(state.data); const col = score>=80?'#10b981':score>=60?'#7c3aed':score>=40?'#f59e0b':'#f43f5e'; drawRing(h, score/100, col, {lineWidth:10,padding:6}) }
    }
    if (state.view === 'goals') {
      state.data.goals.forEach(g => {
        const canvas = document.getElementById(`goal-ring-${g.id}`)
        if (canvas) drawRing(canvas, Math.min(1,g.current/g.target), g.color||'#10b981', {lineWidth:10,padding:6})
      })
    }
    if (state.view === 'loans') {
      state.data.loans.forEach(loan => {
        const canvas = document.getElementById(`loan-ring-${loan.id}`)
        if (canvas) {
          const repaid = (loan.payments||[]).reduce((s,p)=>s+p.amount,0)
          const pct = loan.totalDebt > 0 ? Math.min(1, repaid/loan.totalDebt) : 0
          drawRing(canvas, pct, pct>=1?'#10b981':'#7c3aed', {lineWidth:10,padding:6})
        }
      })
    }
  })
}

// Update plan summary bars without full re-render (keeps input focus)
function updatePlanSummary() {
  if (!state._draftBudget) return
  const { catTotal, goalTotal, debtTotal, totalCommitted, remaining } = calcMonthSummary(state.data, state._draftBudget)
  const income = state._draftBudget.income || 0
  const over   = totalCommitted > income
  const pct    = income > 0 ? Math.min(100, Math.round(totalCommitted/income*100)) : 0

  const fill = document.querySelector('.plan-progress-fill')
  if (fill) {
    fill.style.width = pct + '%'
    fill.className = `plan-progress-fill ${over ? 'over' : pct > 95 ? 'near' : ''}`
  }
  const labels = document.querySelector('.plan-progress-labels')
  if (labels) {
    labels.innerHTML = `
      <span>${cs(totalCommitted, profCur())} planned</span>
      <span class="${over ? 'text-red' : 'text-emerald'}">${over ? '⚠️ ' + cs(Math.abs(remaining), profCur()) + ' over' : '✅ ' + cs(remaining, profCur()) + ' free'}</span>`
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(html) {
  const root = document.getElementById('modal-root')
  root.innerHTML = `<div class="modal-backdrop" id="modal-bg">${html}</div>`
  root.querySelector('#modal-bg').addEventListener('click', e => { if (e.target.id==='modal-bg') closeModal() })
}
function closeModal() { document.getElementById('modal-root').innerHTML = '' }

function currencySelect(id, selected) {
  return `<select class="field-input" id="${id}">${CURRENCIES.map(cur=>`<option value="${cur}" ${cur===selected?'selected':''}>${cur}</option>`).join('')}</select>`
}

// ── Salary / profile modal ────────────────────────────────────────────────────

function openSalaryModal() {
  const { profile } = state.data
  const locations = ['London','Manchester','Edinburgh','Bristol','Birmingham','Paris','Amsterdam','Berlin','Dublin','New York','Remote']
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">💼 Salary & Settings</div><button class="modal-close" id="mc">×</button></div>
      <div class="salary-input-hero">
        <div class="sih-icon">💰</div>
        <div class="sih-label">Default Monthly Net (can vary each month)</div>
        <input class="salary-big-input" id="salary-input" type="number" value="${profile.salaryNet||''}" placeholder="0" autofocus>
      </div>
      <div class="salary-divider">50/30/20 Preview</div>
      <div id="rule-preview">${renderRulePreview(profile.salaryNet||0, profile.currency)}</div>
      <div class="field-row" style="margin-top:16px;">
        <div class="field"><label class="field-label">Your name</label><input class="field-input" id="name-input" value="${profile.name}" placeholder="e.g. Elena"></div>
        <div class="field"><label class="field-label">City</label>
          <select class="field-input" id="location-input">
            ${locations.map(l=>`<option value="${l}" ${l===profile.location?'selected':''}>${l}</option>`).join('')}
            <option value="${profile.location||''}" ${!locations.includes(profile.location)?'selected':''}>Other</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Base Currency</label>${currencySelect('currency-select', profile.currency)}</div>
        <div class="field"><label class="field-label">GBP → EUR Rate</label><input class="field-input" id="rate-input" type="number" step="0.001" value="${profile.gbpToEurRate||1.17}" placeholder="1.17"></div>
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
      state.data.profile.salaryNet   = val
      state.data.profile.name        = document.getElementById('name-input').value.trim()
      state.data.profile.location    = document.getElementById('location-input').value
      state.data.profile.currency    = document.getElementById('currency-select').value
      state.data.profile.gbpToEurRate = parseFloat(document.getElementById('rate-input').value) || 1.17
      state.data.profile.updatedAt   = new Date().toISOString()
      saveData(); closeModal(); render()
    }
  })
}

function renderRulePreview(salary, currency='£') {
  return `<div class="rule-preview">
    <div class="rule-card needs"><div class="rc-label">Needs</div><div class="rc-pct" style="color:#5b21b6">50%</div><div class="rc-amount">${c(salary*.5,currency)}</div></div>
    <div class="rule-card wants"><div class="rc-label">Wants</div><div class="rc-pct" style="color:#1d4ed8">30%</div><div class="rc-amount">${c(salary*.3,currency)}</div></div>
    <div class="rule-card saves"><div class="rc-label">Savings</div><div class="rc-pct" style="color:#047857">20%</div><div class="rc-amount">${c(salary*.2,currency)}</div></div>
  </div>`
}

// ── Rate modal ────────────────────────────────────────────────────────────────

function openRateModal() {
  const rate = state.data.profile.gbpToEurRate || 1.17
  openModal(`
    <div class="modal" style="max-width:380px;">
      <div class="modal-header"><div class="modal-title">💱 GBP → EUR Rate</div><button class="modal-close" id="mc">×</button></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">This rate is used to calculate how many euros your pound payments produce when repaying your loan.</p>
      <div class="field"><label class="field-label">Current rate (£1 = €?)</label>
        <input class="field-input" id="rate-inp" type="number" step="0.001" value="${rate}" placeholder="1.17" autofocus>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">Example: £300 × ${rate.toFixed(3)} = €${(300*rate).toFixed(0)}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="mc2">Cancel</button>
        <button class="btn btn-primary" id="save-rate">Save Rate</button>
      </div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.getElementById('rate-inp')?.addEventListener('input', e => {
    const r = parseFloat(e.target.value) || 1
    const preview = document.querySelector('[style*="Example"]')
    if (preview) preview.textContent = `Example: £300 × ${r.toFixed(3)} = €${(300*r).toFixed(0)}`
  })
  document.getElementById('save-rate')?.addEventListener('click', () => {
    const r = parseFloat(document.getElementById('rate-inp').value)
    if (r > 0) { state.data.profile.gbpToEurRate = r; saveData(); closeModal(); render() }
  })
}

// ── Category modal ────────────────────────────────────────────────────────────

function openCategoryModal(editId) {
  const existing = editId ? state.data.categories.find(c => c.id === editId) : null
  const icons  = ['🏠','🍽️','🚌','💊','⚡','🛍️','🎬','📱','📚','📦','☕','🚗','✈️','🎵','🍺','🏋️','💈','🐾','🎮','🧴','🎁','🍕','🛒','💡','🏥','🎓','🐕','🌱','🎨','💇']
  const colors = ['#7c3aed','#f97316','#0ea5e9','#10b981','#f59e0b','#f43f5e','#8b5cf6','#14b8a6','#ef4444','#3b82f6','#84cc16','#94a3b8']
  let selIcon = existing?.icon || '📦'
  let selColor = existing?.color || '#7c3aed'
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Category':'New Category'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field"><label class="field-label">Name</label><input class="field-input" id="cat-name" value="${existing?.name||''}" placeholder="e.g. Gym, Pets…" autofocus></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Type</label><select class="field-input" id="cat-essential"><option value="0" ${!existing?.essential?'selected':''}>Want 😊</option><option value="1" ${existing?.essential?'selected':''}>Need 🏠</option></select></div>
        <div class="field"><label class="field-label">Default Budget</label><input class="field-input" id="cat-budget" type="number" value="${existing?.budget||''}" placeholder="0"></div>
      </div>
      <div class="field"><label class="field-label">Icon</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;" id="icon-picker">
          ${icons.map(ic=>`<span data-icon="${ic}" style="font-size:20px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${ic===selIcon?'var(--primary)':'transparent'}">${ic}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Colour</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;" id="color-picker">
          ${colors.map(co=>`<div data-color="${co}" style="width:26px;height:26px;border-radius:50%;background:${co};cursor:pointer;border:3px solid ${co===selColor?'#1a0f2e':'transparent'}"></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-cat-btn">${existing?'Update':'Add'}</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.querySelectorAll('#icon-picker span').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#icon-picker span').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='var(--primary)';selIcon=el.dataset.icon})})
  document.querySelectorAll('#color-picker div').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#color-picker div').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#1a0f2e';selColor=el.dataset.color})})
  document.getElementById('save-cat-btn')?.addEventListener('click', () => {
    const name = document.getElementById('cat-name').value.trim()
    if (!name) return
    const budget = parseFloat(document.getElementById('cat-budget').value)||0
    const essential = document.getElementById('cat-essential').value==='1'
    if (existing) Object.assign(existing, {name, icon:selIcon, color:selColor, essential, budget})
    else state.data.categories.push({id:'cat_'+uuid().slice(0,8), name, icon:selIcon, color:selColor, essential, budget})
    saveData(); closeModal(); render()
  })
}

// ── Goal modals ───────────────────────────────────────────────────────────────

function openGoalModal(editId) {
  const existing = editId ? state.data.goals.find(g=>g.id===editId) : null
  const icons  = ['🎯','🏖️','🏠','🚗','🎓','✈️','💍','🏋️','🛡️','🎸','💻','🌍','🐕','🎨','🏄']
  const colors = ['#10b981','#7c3aed','#f59e0b','#f43f5e','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
  let selIcon = existing?.icon||'🎯', selColor = existing?.color||'#10b981'
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Goal':'New Goal 🎯'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Goal Name</label><input class="field-input" id="g-name" value="${existing?.name||''}" placeholder="Emergency Fund" autofocus></div>
        <div class="field"><label class="field-label">Currency</label>${currencySelect('g-currency', existing?.currency||profCur())}</div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Target Amount</label><input class="field-input" id="g-target" type="number" value="${existing?.target||''}" placeholder="5000"></div>
        <div class="field"><label class="field-label">Already Saved</label><input class="field-input" id="g-current" type="number" value="${existing?.current||''}" placeholder="0"></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Monthly Contribution</label><input class="field-input" id="g-monthly" type="number" value="${existing?.monthlyContribution||''}" placeholder="200"><div class="field-hint">This auto-appears in your Month Plan budget</div></div>
        <div class="field"><label class="field-label">Deadline (optional)</label><input class="field-input" id="g-deadline" type="date" value="${existing?.deadline||''}"></div>
      </div>
      <div class="field"><label class="field-label">Icon</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;" id="gicon-picker">
          ${icons.map(ic=>`<span data-icon="${ic}" style="font-size:22px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${ic===selIcon?'var(--primary)':'transparent'}">${ic}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Colour</label>
        <div style="display:flex;gap:8px;margin-top:6px;" id="gcolor-picker">
          ${colors.map(co=>`<div data-color="${co}" style="width:24px;height:24px;border-radius:50%;background:${co};cursor:pointer;border:3px solid ${co===selColor?'#1a0f2e':'transparent'}"></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-goal-btn">${existing?'Update':'Create Goal'}</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.querySelectorAll('#gicon-picker span').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#gicon-picker span').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='var(--primary)';selIcon=el.dataset.icon})})
  document.querySelectorAll('#gcolor-picker div').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('#gcolor-picker div').forEach(e=>e.style.borderColor='transparent');el.style.borderColor='#1a0f2e';selColor=el.dataset.color})})
  document.getElementById('save-goal-btn')?.addEventListener('click', () => {
    const name=document.getElementById('g-name').value.trim()
    const target=parseFloat(document.getElementById('g-target').value)
    if(!name||!target) return
    const goal={id:existing?.id||uuid(),name,target,current:parseFloat(document.getElementById('g-current').value)||0,monthlyContribution:parseFloat(document.getElementById('g-monthly').value)||0,deadline:document.getElementById('g-deadline').value||null,icon:selIcon,color:selColor,currency:document.getElementById('g-currency').value}
    if(existing){const idx=state.data.goals.findIndex(g=>g.id===existing.id);state.data.goals[idx]=goal}
    else state.data.goals.push(goal)
    saveData(); closeModal(); render()
  })
}

function openDepositModal(goalId) {
  const goal = state.data.goals.find(g=>g.id===goalId)
  if (!goal) return
  const gCur = goalCur(goal)
  openModal(`
    <div class="modal" style="max-width:360px;">
      <div class="modal-header"><div class="modal-title">${goal.icon} Deposit to ${goal.name}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field"><label class="field-label">Amount (${gCur})</label><input class="field-input" id="dep-amt" type="number" placeholder="0.00" autofocus></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:-8px;">${c(goal.current,gCur)} / ${c(goal.target,gCur)}</div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-dep">Add 🎉</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.getElementById('save-dep')?.addEventListener('click', () => {
    const amt=parseFloat(document.getElementById('dep-amt').value)
    if(amt>0){goal.current=Math.min(goal.target,goal.current+amt);saveData();closeModal();render()}
  })
}

// ── Loan modals ───────────────────────────────────────────────────────────────

function openLoanModal(editId) {
  const existing = editId ? state.data.loans.find(l=>l.id===editId) : null
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${existing?'Edit Loan':'New Loan 📉'}</div><button class="modal-close" id="mc">×</button></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Loan Name</label><input class="field-input" id="l-name" value="${existing?.name||''}" placeholder="Student Loan…" autofocus></div>
        <div class="field"><label class="field-label">Loan Currency</label>${currencySelect('l-currency', existing?.currency||profCur())}</div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Total Debt</label><input class="field-input" id="l-total" type="number" value="${existing?.totalDebt||''}" placeholder="50000"></div>
        <div class="field"><label class="field-label">Monthly Payment (in loan currency)</label><input class="field-input" id="l-monthly" type="number" value="${existing?.monthlyPayment||''}" placeholder="500"><div class="field-hint">Auto-shown in Month Plan</div></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Interest Rate (%)</label><input class="field-input" id="l-interest" type="number" value="${existing?.interestRate||0}" placeholder="0" step="0.1"><div class="field-hint">0 for interest-free</div></div>
        <div class="field"><label class="field-label">Start Date</label><input class="field-input" id="l-start" type="date" value="${existing?.startDate||new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-loan-btn">${existing?'Update':'Add Loan'}</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  document.getElementById('save-loan-btn')?.addEventListener('click', () => {
    const name=document.getElementById('l-name').value.trim()
    const totalDebt=parseFloat(document.getElementById('l-total').value)
    if(!name||!totalDebt) return
    const loan={id:existing?.id||uuid(),name,totalDebt,monthlyPayment:parseFloat(document.getElementById('l-monthly').value)||0,interestRate:parseFloat(document.getElementById('l-interest').value)||0,startDate:document.getElementById('l-start').value,currency:document.getElementById('l-currency').value,payments:existing?.payments||[]}
    if(existing){const idx=state.data.loans.findIndex(l=>l.id===existing.id);state.data.loans[idx]=loan}
    else state.data.loans.push(loan)
    saveData(); closeModal(); render()
  })
}

function openLoanPaymentModal(loanId) {
  const loan = state.data.loans.find(l=>l.id===loanId)
  if (!loan) return
  const lCur = loanCur(loan)
  const pCur = profCur()
  const isCross = lCur !== pCur
  const rate = state.data.profile.gbpToEurRate || 1
  const repaid = (loan.payments||[]).reduce((s,p)=>s+p.amount,0)
  const balance = Math.max(0, loan.totalDebt-repaid)
  openModal(`
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><div class="modal-title">📉 Record Payment — ${loan.name}</div><button class="modal-close" id="mc">×</button></div>
      <div style="text-align:center;padding:10px 0 18px;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Remaining Balance</div>
        <div style="font-size:36px;font-weight:900;color:var(--primary);letter-spacing:-1.5px;">${c(balance, lCur)}</div>
      </div>
      ${isCross ? `
      <div class="cross-currency-info mb16">
        💱 You send <strong>${pCur}</strong> → loan receives <strong>${lCur}</strong> at rate ${rate.toFixed(4)}
      </div>` : ''}
      <div class="field-row">
        <div class="field">
          <label class="field-label">${isCross ? `Amount Sent (${pCur})` : `Payment Amount (${lCur})`}</label>
          <input class="field-input" id="pay-sent" type="number" placeholder="${loan.monthlyPayment ? (isCross ? (loan.monthlyPayment/rate).toFixed(0) : loan.monthlyPayment) : ''}" value="${loan.monthlyPayment ? (isCross ? (loan.monthlyPayment/rate).toFixed(0) : loan.monthlyPayment) : ''}" autofocus>
          ${isCross ? `<div class="field-hint" id="conversion-preview">= ${c(loan.monthlyPayment||0, lCur)} received</div>` : ''}
        </div>
        <div class="field"><label class="field-label">Date</label><input class="field-input" id="pay-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="field"><label class="field-label">Note (optional)</label><input class="field-input" id="pay-note" placeholder="Monthly payment…"></div>
      <div class="modal-footer"><button class="btn btn-secondary" id="mc2">Cancel</button><button class="btn btn-primary" id="save-pay-btn">Record ✅</button></div>
    </div>`)
  document.getElementById('mc')?.addEventListener('click', closeModal)
  document.getElementById('mc2')?.addEventListener('click', closeModal)
  if (isCross) {
    document.getElementById('pay-sent')?.addEventListener('input', e => {
      const gbp = parseFloat(e.target.value)||0
      const eur = gbp * rate
      const preview = document.getElementById('conversion-preview')
      if (preview) preview.textContent = `= ${c(eur, lCur)} received`
    })
  }
  document.getElementById('save-pay-btn')?.addEventListener('click', () => {
    const sentAmt = parseFloat(document.getElementById('pay-sent').value)
    if (!sentAmt || sentAmt <= 0) return
    const receivedAmt = isCross ? sentAmt * rate : sentAmt
    const payment = {
      id: uuid(),
      amount: receivedAmt,      // amount in loan currency (reduces balance)
      sentAmount: isCross ? sentAmt : null,  // amount in profile currency (what was sent)
      date: document.getElementById('pay-date').value,
      note: document.getElementById('pay-note').value.trim() || 'Payment',
      rate: isCross ? rate : null,
    }
    if (!loan.payments) loan.payments = []
    loan.payments.push(payment)
    saveData(); closeModal(); render()
  })
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message, type='info') {
  document.getElementById('toast')?.remove()
  const colors = {info:'#1a0f2e',success:'#065f46',error:'#7f1d1d',loading:'#1a0f2e'}
  const icons  = {info:'ℹ️',success:'✅',error:'❌',loading:'⏳'}
  const toast = document.createElement('div')
  toast.id = 'toast'
  toast.innerHTML = `<span style="font-size:16px">${icons[type]||icons.info}</span><span>${message}</span>`
  Object.assign(toast.style, {
    position:'fixed',bottom:'28px',left:'50%',transform:'translateX(-50%)',
    background:colors[type]||colors.info,color:'#fff',
    padding:'12px 22px',borderRadius:'14px',fontSize:'14px',fontWeight:'600',
    display:'flex',alignItems:'center',gap:'10px',
    boxShadow:'0 8px 32px rgba(0,0,0,0.25)',zIndex:'9999',
    animation:'fadeInUp 0.2s ease',whiteSpace:'nowrap',
  })
  if (!document.getElementById('toast-style')) {
    const s = document.createElement('style')
    s.id = 'toast-style'
    s.textContent = `@keyframes fadeInUp { from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }`
    document.head.appendChild(s)
  }
  document.body.appendChild(toast)
  if (type !== 'loading') setTimeout(() => toast.remove(), 4000)
  return toast
}

// ── GitHub backup ─────────────────────────────────────────────────────────────

async function handleBackup() {
  const btn = document.getElementById('backup-btn')
  if (btn) { btn.disabled=true; btn.querySelector('#backup-label').textContent='Backing up…'; btn.querySelector('#backup-icon').textContent='⏳' }
  showToast('Saving to GitHub…', 'loading')
  try {
    const result = await window.budget.gitBackup()
    document.getElementById('toast')?.remove()
    if (result.ok) {
      showToast(result.message, 'success')
      if (btn) { btn.disabled=false; btn.querySelector('#backup-icon').textContent='☁️'; btn.querySelector('#backup-label').textContent='Back up now'; document.getElementById('backup-status').textContent='Last: just now' }
    } else {
      showToast(result.error, 'error')
      if (btn) { btn.disabled=false; btn.querySelector('#backup-icon').textContent='☁️'; btn.querySelector('#backup-label').textContent='Back up now' }
    }
  } catch(e) {
    document.getElementById('toast')?.remove()
    showToast('Backup failed: '+e.message, 'error')
    if (btn) { btn.disabled=false; btn.querySelector('#backup-icon').textContent='☁️'; btn.querySelector('#backup-label').textContent='Back up now' }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const saved = await window.budget.load()
  if (saved) {
    const merged = defaultData()
    if (saved.profile) Object.assign(merged.profile, saved.profile)
    // Ensure gbpToEurRate exists
    if (!merged.profile.gbpToEurRate) merged.profile.gbpToEurRate = 1.17
    if (saved.categories) {
      merged.categories = saved.categories.map(sc => {
        const def = merged.categories.find(c => c.id === sc.id)
        return def ? Object.assign({}, def, sc) : sc
      })
      const missing = defaultData().categories.filter(dc => !merged.categories.find(c => c.id === dc.id))
      merged.categories = [...merged.categories, ...missing]
    }
    // Migrate old transactions data (ignore it, we don't use it anymore)
    if (saved.monthlyBudgets) merged.monthlyBudgets = saved.monthlyBudgets
    if (saved.goals)          merged.goals           = saved.goals
    if (saved.loans)          merged.loans           = saved.loans
    state.data = merged
  }

  state.planMonth = getCurrentMonthKey()

  // Nav — once
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view))
  })

  // Backup button — once
  document.getElementById('backup-btn')?.addEventListener('click', handleBackup)
  window.budget.gitStatus().then(s => {
    if (s.ok && s.lastBackup) document.getElementById('backup-status').textContent = 'Last: '+s.lastBackup
  }).catch(()=>{})

  // Settings icon in sidebar top (click logo to open salary settings)
  document.getElementById('logo')?.addEventListener('click', openSalaryModal)

  render()
}

init()
