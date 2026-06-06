// ── Canvas Chart Library ─────────────────────────────────────────────────────

function drawDonutChart(canvas, slices, opts = {}) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.width
  const h = canvas.clientHeight || canvas.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2
  const radius = Math.min(w, h) / 2 - 8
  const inner = radius * (opts.innerRatio || 0.62)

  const total = slices.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true)
    ctx.fillStyle = '#e2e8f0'
    ctx.fill()
    return
  }

  let startAngle = -Math.PI / 2
  slices.forEach((slice, i) => {
    const angle = (slice.value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle)
    ctx.closePath()
    ctx.fillStyle = slice.color
    ctx.fill()
    startAngle += angle
  })

  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.fillStyle = opts.bg || '#ffffff'
  ctx.fill()
}

function drawRing(canvas, progress, color, opts = {}) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  // Prefer explicit CSS style over clientWidth — clientWidth grows each redraw
  // when no CSS dimensions are set, because setting canvas.width changes layout size.
  const w = parseFloat(canvas.style.width) || canvas.clientWidth || canvas.width || 36
  const h = parseFloat(canvas.style.height) || canvas.clientHeight || canvas.height || 36
  canvas.style.width  = w + 'px'   // lock CSS size so it never grows
  canvas.style.height = h + 'px'
  canvas.width  = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2
  const radius = Math.min(w, h) / 2 - (opts.padding || 4)
  const lineWidth = opts.lineWidth || 8

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = opts.trackColor || '#e2e8f0'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.stroke()

  if (progress > 0) {
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + Math.PI * 2 * Math.min(1, progress)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startAngle, endAngle)
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

function drawBarChart(canvas, months, datasets, opts = {}) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.width
  const h = canvas.clientHeight || canvas.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const pad = { top: 16, right: 12, bottom: 36, left: 52 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const allVals = datasets.flatMap(d => d.data)
  const maxVal = Math.max(...allVals, 1)
  const gridLines = 4

  ctx.font = `${10 * dpr}px -apple-system, sans-serif`
  ctx.textBaseline = 'middle'

  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + chartH - (i / gridLines) * chartH
    const val = (maxVal / gridLines) * i
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(pad.left + chartW, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'right'
    ctx.fillText(val >= 1000 ? Math.round(val/1000)+'k' : Math.round(val), pad.left - 6, y)
  }

  const nBars = datasets.length
  const groupW = chartW / months.length
  const barW = Math.min(18, (groupW - 8) / nBars)
  const gap = 3

  datasets.forEach((ds, di) => {
    ds.data.forEach((val, mi) => {
      const x = pad.left + mi * groupW + groupW / 2 - (nBars * (barW + gap)) / 2 + di * (barW + gap)
      const barH = (val / maxVal) * chartH
      const y = pad.top + chartH - barH
      ctx.fillStyle = ds.color
      const r = Math.min(4, barW / 2)
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, [r, r, 0, 0])
      ctx.fill()
    })
  })

  months.forEach((label, mi) => {
    const x = pad.left + mi * groupW + groupW / 2
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, pad.top + chartH + 8)
  })
}

function drawLineChart(canvas, months, datasets, opts = {}) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.width
  const h = canvas.clientHeight || canvas.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const pad = { top: 20, right: 24, bottom: 36, left: 56 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const allVals = datasets.flatMap(d => d.data.filter(v => v != null))
  const maxVal = Math.max(...allVals, 1)
  const gridLines = 4

  ctx.font = `${10 * dpr}px -apple-system, sans-serif`

  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + chartH - (i / gridLines) * chartH
    const val = (maxVal / gridLines) * i
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(pad.left + chartW, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(val >= 1000 ? Math.round(val/1000)+'k' : Math.round(val), pad.left - 6, y)
  }

  const xStep = chartW / (months.length - 1 || 1)

  datasets.forEach(ds => {
    const points = ds.data.map((v, i) => ({
      x: pad.left + i * xStep,
      y: v != null ? pad.top + chartH - (v / maxVal) * chartH : null,
      v
    }))

    if (ds.dashed) ctx.setLineDash([6, 4])
    else ctx.setLineDash([])

    if (ds.fill) {
      const validPoints = points.filter(p => p.y != null)
      if (validPoints.length > 1) {
        ctx.beginPath()
        ctx.moveTo(validPoints[0].x, pad.top + chartH)
        validPoints.forEach(p => ctx.lineTo(p.x, p.y))
        ctx.lineTo(validPoints[validPoints.length - 1].x, pad.top + chartH)
        ctx.closePath()
        ctx.fillStyle = ds.color + '1a'
        ctx.fill()
      }
    }

    ctx.beginPath()
    let started = false
    points.forEach(p => {
      if (p.y == null) return
      if (!started) { ctx.moveTo(p.x, p.y); started = true }
      else ctx.lineTo(p.x, p.y)
    })
    ctx.strokeStyle = ds.color
    ctx.lineWidth = ds.lineWidth || 2.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.setLineDash([])

    points.forEach(p => {
      if (p.y == null) return
      ctx.beginPath()
      ctx.arc(p.x, p.y, ds.dotRadius || 4, 0, Math.PI * 2)
      ctx.fillStyle = p.forecast ? ds.color + '88' : ds.color
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
  })

  ctx.setLineDash([])
  months.forEach((label, i) => {
    const x = pad.left + i * xStep
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, pad.top + chartH + 8)
  })

  if (opts.forecastStart != null) {
    const x = pad.left + opts.forecastStart * xStep
    ctx.strokeStyle = '#c7d2fe'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x, pad.top)
    ctx.lineTo(x, pad.top + chartH)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#8b5cf6'
    ctx.font = `bold ${10 * dpr}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('FORECAST →', x + 40, pad.top + 2)
  }
}
