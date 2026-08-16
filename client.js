/**
 * dsh-token-pulse — Client 半部分
 *
 * 在设置面板注册「Token 用量」页面：汇总卡片、GitHub 风格热力图（年份下拉框）、
 * 近 24 小时 / 近 7 天平滑曲线（图例点击筛选）。
 *
 * 用法：作为动态 Cordis 插件安装（见 README.md），本文件即 code.client 的内容。
 */

const LINE_COLORS = { input: '#3b82f6', output: '#22c55e', cache: '#f59e0b', total: '#a855f7' }
const SERIES = [
  { key: 'input', name: '输入', color: LINE_COLORS.input },
  { key: 'output', name: '输出', color: LINE_COLORS.output },
  { key: 'cache', name: '缓存', color: LINE_COLORS.cache },
  { key: 'total', name: '总量', color: LINE_COLORS.total },
]

function fmt(n) {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}

function dayKey(t) {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

// Monotone cubic interpolation (Fritsch-Carlson, same construction as d3 curveMonotoneX):
// each segment's curve stays strictly between its two endpoint y values, so the
// path can never dip below the lowest data point (the zero axis).
function smoothPath(pts) {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1)
  if (n === 2) return 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1) + ' L ' + pts[1][0].toFixed(1) + ' ' + pts[1][1].toFixed(1)
  const dx = []
  const m = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    m[i] = dx[i] !== 0 ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0
  }
  const t = []
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0
    } else {
      const a = dx[i - 1]
      const b = dx[i]
      t[i] = (3 * (a + b)) / ((2 * b + a) / m[i - 1] + (b + 2 * a) / m[i])
    }
  }
  let d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1)
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i][0] + dx[i] / 3
    const c1y = pts[i][1] + t[i] * dx[i] / 3
    const c2x = pts[i + 1][0] - dx[i] / 3
    const c2y = pts[i + 1][1] - t[i + 1] * dx[i] / 3
    d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + pts[i + 1][0].toFixed(1) + ' ' + pts[i + 1][1].toFixed(1)
  }
  return d
}

function Heatmap(props) {
  const data = props.data
  const dailyMap = data ? data.dailyMap : {}
  const year = Number(props.year) || new Date().getFullYear()
  let max = 0
  for (const k in dailyMap) {
    if (dailyMap[k].total > max) max = dailyMap[k].total
  }
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)
  const firstSunday = new Date(yearStart.getTime() - yearStart.getDay() * 86400000)
  const weeks = Math.ceil((yearEnd.getTime() - firstSunday.getTime()) / 86400000 / 7)
  const monthCells = []
  const weekEls = []
  for (let w = 0; w < weeks; w++) {
    const colStart = new Date(firstSunday.getTime() + w * 7 * 86400000)
    let monthLabel = ''
    const cells = []
    for (let d = 0; d < 7; d++) {
      const t = colStart.getTime() + d * 86400000
      if (t < yearStart.getTime() || t > yearEnd.getTime()) continue
      if (t > todayStart.getTime()) continue
      const dt = new Date(t)
      const key = dayKey(t)
      if (dt.getDate() === 1) monthLabel = String(dt.getMonth() + 1) + '月'
      const cell = dailyMap[key]
      const style = {
        width: 11,
        height: 11,
        borderRadius: 2,
        background: cell && cell.total > 0
          ? 'rgba(59, 130, 246, ' + (0.15 + 0.85 * cell.total / max).toFixed(3) + ')'
          : 'var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.4))',
      }
      const title = cell
        ? key + ' · 输入 ' + fmt(cell.input) + ' · 输出 ' + fmt(cell.output) + ' · 缓存 ' + fmt(cell.cache) + ' · 总量 ' + fmt(cell.total)
        : undefined
      cells.push(React.createElement('div', { key: d, className: 'tu-cell', style, title }))
    }
    monthCells.push(React.createElement('div', { key: w, className: 'tu-hm-month' }, monthLabel))
    weekEls.push(React.createElement('div', { key: w, className: 'tu-week' }, cells))
  }
  const dayLabels = ['日', '', '二', '', '四', '', '六']
  const dayEls = dayLabels.map((label, i) => React.createElement('div', { key: i, className: 'tu-hm-day' }, label))
  return React.createElement('div', { className: 'tu-heatmap-scroll' },
    React.createElement('div', { className: 'tu-hm' },
      React.createElement('div', { className: 'tu-hm-top' },
        React.createElement('div', { className: 'tu-hm-corner' }),
        React.createElement('div', { className: 'tu-hm-months' }, monthCells),
      ),
      React.createElement('div', { className: 'tu-hm-main' },
        React.createElement('div', { className: 'tu-hm-days' }, dayEls),
        React.createElement('div', { className: 'tu-hm-weeks' }, weekEls),
      ),
    ),
  )
}

function LineChart(props) {
  const points = props.points || []
  const xLabel = props.xLabel
  const [hidden, setHidden] = React.useState({})
  const visible = SERIES.filter((s) => hidden[s.key] !== true)
  let max = 0
  for (const p of points) {
    for (const s of visible) {
      if (p[s.key] > max) max = p[s.key]
    }
  }
  if (max <= 0) max = 1
  const W = 640
  const H = 170
  const PADL = 46
  const PADR = 8
  const PADT = 8
  const PADB = 20
  const iw = W - PADL - PADR
  const ih = H - PADT - PADB
  const x = (i) => points.length <= 1 ? PADL + iw / 2 : PADL + (i * iw) / (points.length - 1)
  const y = (v) => PADT + ih - (v / max) * ih
  const children = []
  children.push(React.createElement('line', { key: 'g0', x1: PADL, y1: y(0), x2: W - PADR, y2: y(0), stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1 }))
  children.push(React.createElement('line', { key: 'g1', x1: PADL, y1: y(max / 2), x2: W - PADR, y2: y(max / 2), stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1, strokeDasharray: '3 3' }))
  children.push(React.createElement('text', { key: 'y0', x: PADL - 6, y: y(0) + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, '0'))
  children.push(React.createElement('text', { key: 'y1', x: PADL - 6, y: y(max / 2) + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, fmt(max / 2)))
  children.push(React.createElement('text', { key: 'y2', x: PADL - 6, y: y(max) + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, fmt(max)))
  for (const s of visible) {
    const pts = points.map((p, i) => [x(i), y(p[s.key])])
    children.push(React.createElement('path', { key: s.key, d: smoothPath(pts), fill: 'none', stroke: s.color, strokeWidth: 1.5, strokeLinecap: 'round' }))
  }
  const step = Math.max(1, Math.ceil(points.length / 6))
  for (let i = 0; i < points.length; i += step) {
    children.push(React.createElement('text', { key: 'x' + i, x: x(i), y: H - 6, textAnchor: 'middle', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, xLabel(points[i].t)))
  }
  if (points.length > 0 && (points.length - 1) % step !== 0) {
    const i = points.length - 1
    children.push(React.createElement('text', { key: 'xlast', x: x(i), y: H - 6, textAnchor: 'middle', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, xLabel(points[i].t)))
  }
  return React.createElement('div', { className: 'tu-chart' },
    React.createElement('div', { className: 'tu-chart-title' }, props.title),
    React.createElement('svg', { viewBox: '0 0 ' + W + ' ' + H, className: 'tu-svg' }, children),
    React.createElement('div', { className: 'tu-legend-row' },
      SERIES.map((s) => {
        const off = hidden[s.key] === true
        return React.createElement('span', {
          key: s.key,
          className: off ? 'tu-legend tu-legend-off' : 'tu-legend',
          title: off ? '点击显示 ' + s.name : '点击隐藏 ' + s.name,
          onClick: () => setHidden(Object.assign({}, hidden, { [s.key]: !off })),
        },
          React.createElement('span', { className: 'tu-swatch', style: { background: s.color } }),
          s.name,
        )
      }),
    ),
  )
}

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    styles.insert('.tu-page { display: flex; flex-direction: column; gap: 20px; color: var(--dsw-alias-label-primary); font-size: 13px; } .tu-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .tu-stat { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; background: var(--dsw-alias-bg-layer-1); } .tu-stat-label { font-size: 11px; color: var(--dsw-alias-label-secondary); } .tu-stat-value { font-size: 16px; font-weight: 600; margin-top: 2px; } .tu-block { display: flex; flex-direction: column; gap: 12px; } .tu-block-title { font-weight: 600; font-size: 14px; } .tu-hm-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .tu-year-select { font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; } .tu-empty { color: var(--dsw-alias-label-secondary); } .tu-heatmap-scroll { overflow-x: auto; padding-bottom: 4px; } .tu-hm { display: flex; flex-direction: column; gap: 4px; min-width: max-content; } .tu-hm-top { display: flex; gap: 4px; } .tu-hm-corner { width: 26px; flex: none; } .tu-hm-months { display: flex; gap: 3px; font-size: 10px; color: var(--dsw-alias-label-secondary); } .tu-hm-month { width: 11px; white-space: nowrap; overflow: visible; } .tu-hm-main { display: flex; gap: 4px; } .tu-hm-days { display: flex; flex-direction: column; gap: 3px; width: 26px; font-size: 10px; color: var(--dsw-alias-label-secondary); flex: none; } .tu-hm-day { height: 11px; line-height: 11px; } .tu-hm-weeks { display: flex; gap: 3px; } .tu-week { display: flex; flex-direction: column; gap: 3px; } .tu-cell { flex: none; } .tu-chart { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 12px; background: var(--dsw-alias-bg-layer-1); } .tu-chart-title { font-weight: 600; margin-bottom: 8px; font-size: 14px; } .tu-svg { width: 100%; height: auto; display: block; } .tu-legend-row { display: flex; gap: 14px; margin-top: 6px; flex-wrap: wrap; } .tu-legend { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; } .tu-legend-off { opacity: 0.4; } .tu-swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }')

    function TokenUsageSection(props) {
      const useWorkspaces = props && props.useWorkspaces ? props.useWorkspaces : null
      const [data, setData] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const currentYear = new Date().getFullYear()
      const [year, setYear] = React.useState(currentYear)

      const workspaceState = useWorkspaces ? useWorkspaces((s) => s) : null
      const rootPath = (() => {
        if (!workspaceState || !workspaceState.items || workspaceState.items.length === 0) return null
        const recent = workspaceState.items.find((w) => w.workspaceId === workspaceState.recentWorkspaceId)
        const pick = recent || workspaceState.items[0]
        return pick && typeof pick.path === 'string' ? pick.path : null
      })()
      React.useEffect(() => {
        if (rootPath) host.call('set-workspace-root', { root: rootPath }).catch(() => {})
      }, [rootPath])

      React.useEffect(() => {
        let alive = true
        const refresh = async () => {
          try {
            const result = await host.call('get-stats')
            if (!alive) return
            setData(result)
            setFailed(false)
          } catch (err) {
            if (!alive) return
            setFailed(true)
          }
        }
        refresh()
        const stop = ctx.interval(() => { refresh().catch(() => {}) }, 10000)
        return () => { alive = false; stop() }
      }, [])

      const totals = data && data.totals ? data.totals : { input: 0, output: 0, cache: 0, total: 0 }
      const hasData = totals.total > 0
      const stats = [
        { label: '输入', value: totals.input },
        { label: '输出', value: totals.output },
        { label: '缓存', value: totals.cache },
        { label: '总量', value: totals.total },
      ]
      const yearOptions = []
      for (let y = 2026; y <= Math.max(2026, currentYear); y++) yearOptions.push(y)
      return React.createElement('div', { className: 'tu-page' },
        React.createElement('div', { className: 'tu-stats' },
          stats.map((s) => React.createElement('div', { key: s.label, className: 'tu-stat' },
            React.createElement('div', { className: 'tu-stat-label' }, s.label),
            React.createElement('div', { className: 'tu-stat-value' }, fmt(s.value)),
          )),
        ),
        data === null && !failed ? React.createElement('div', { className: 'tu-empty' }, '加载中…') : null,
        failed && data === null ? React.createElement('div', { className: 'tu-empty' }, '读取统计数据失败，正在重试…') : null,
        data !== null && !hasData ? React.createElement('div', { className: 'tu-empty' }, '暂无数据：开始对话后自动统计 token 用量。') : null,
        data !== null && hasData ? React.createElement('div', { className: 'tu-block' },
          React.createElement('div', { className: 'tu-hm-header' },
            React.createElement('div', { className: 'tu-block-title' }, '每日热力图'),
            React.createElement('select', {
              className: 'tu-year-select',
              value: year,
              onChange: (e) => setYear(Number(e.target.value)),
            },
              yearOptions.map((y) => React.createElement('option', { key: y, value: y }, String(y))),
            ),
          ),
          React.createElement(Heatmap, { data, year }),
          React.createElement(LineChart, {
            title: '近 24 小时',
            points: data.hourly24,
            xLabel: (t) => String(new Date(t).getHours()).padStart(2, '0') + ':00',
          }),
          React.createElement(LineChart, {
            title: '近 7 天',
            points: data.daily7,
            xLabel: (t) => {
              const d = new Date(t)
              return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
            },
          }),
        ) : null,
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'token-usage', order: 30, label: 'Token 用量' },
      (props) => React.createElement(TokenUsageSection, props),
    ))
  },
}
