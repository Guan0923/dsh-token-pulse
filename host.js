/**
 * dsh-token-pulse — Host 半部分
 *
 * 记录进程内全部模型调用的 token 用量（输入/输出/缓存），
 * 防抖写入 <工作区>/.dsh-token-usage.json，并提供 get-stats / set-workspace-root
 * 两个 Package-private RPC 供客户端调用。
 *
 * 用法：作为动态 Cordis 插件安装（见 README.md），本文件即 code.host 的内容。
 */

const FILE_NAME = '.dsh-token-usage.json'
const MAX_AGE_MS = 400 * 24 * 3600 * 1000
const EMPTY = () => ({ input: 0, output: 0, cache: 0, total: 0 })

function dayKey(t) {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

function add(target, rec) {
  target.input += rec.input
  target.output += rec.output
  target.cache += rec.cache
  target.total += rec.input + rec.output + rec.cache
  return target
}

return {
  inject: ['timer'],
  apply(ctx) {
    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const policyRoot = sandboxPolicy !== undefined && typeof sandboxPolicy.workspaceRoot === 'string' ? sandboxPolicy.workspaceRoot : ''

    let userRoot = null
    let fsDefault = null
    let sessionCwd = null
    let sessionObj = null
    let sessionProbed = false
    let lastError = null
    const records = [] // { t, input, output, cache } — owned scalar data only

    async function probeSession() {
      if (sessionProbed) return
      sessionProbed = true
      const sessions = ctx.get('sessions')
      if (sessions === undefined) return
      try {
        const live = await sessions.list()
        const first = live[0]
        if (first) {
          sessionObj = first
          sessionCwd = first.header && typeof first.header.cwd === 'string' && first.header.cwd.length > 0 ? first.header.cwd : null
        }
      } catch (err) {
        lastError = 'sessions: ' + String(err)
      }
    }

    let registryProbe = null
    async function probeRegistryRoot() {
      if (registryProbe !== null) return registryProbe
      registryProbe = (async () => {
        try {
          const reg = ctx.get('workspaceRegistry')
          if (reg === undefined) return null
          const list = await reg.list()
          if (list.length === 0) return null
          const withSessions = list.find((w) => w.sessionIds.length > 0)
          if (withSessions) return withSessions.path
          return list[0].path
        } catch (err) {
          lastError = 'registry: ' + String(err)
          return null
        }
      })()
      return registryProbe
    }

    async function currentRoot() {
      if (userRoot !== null) return userRoot
      await probeSession()
      if (sessionCwd !== null) return sessionCwd
      const reg = await probeRegistryRoot()
      if (reg !== null) return reg
      if (fsDefault !== null) return fsDefault
      return policyRoot
    }

    async function currentPolicy() {
      await probeSession()
      if (sandboxPolicy === undefined) return undefined
      try {
        return sessionObj !== null
          ? sandboxPolicy.resolve({ session: sessionObj })
          : sandboxPolicy.resolve()
      } catch (err) {
        lastError = 'policy: ' + String(err)
        return undefined
      }
    }

    async function resolveTarget() {
      if (fs === undefined) return null
      try {
        if (fsDefault === null) {
          const dot = await fs.resolve('.')
          fsDefault = String(dot.targetKey)
        }
        const root = await currentRoot()
        return await fs.resolve(FILE_NAME, root ? { cwd: root } : {})
      } catch (err) {
        lastError = 'resolve: ' + String(err)
        console.error('token-usage: resolve data file failed', err)
        return null
      }
    }

    async function saveNow() {
      const target = await resolveTarget()
      if (target === null) return
      try {
        await fs.writeText(target, JSON.stringify({ v: 1, records }), undefined, undefined, await currentPolicy())
      } catch (err) {
        lastError = 'save: ' + String(err)
        console.error('token-usage: save data file failed', err)
      }
    }

    const saveDebounced = ctx.debounce(() => { saveNow().catch(() => {}) }, 1500)

    const loaded = (async () => {
      const target = await resolveTarget()
      if (target === null) return
      try {
        const text = await fs.readText(target)
        const parsed = JSON.parse(text)
        if (parsed && Array.isArray(parsed.records)) {
          for (const r of parsed.records) {
            if (r && typeof r === 'object' && Number.isFinite(r.t) && Number.isFinite(r.input) && Number.isFinite(r.output) && Number.isFinite(r.cache)) {
              records.push({ t: r.t, input: r.input, output: r.output, cache: r.cache })
            }
          }
        }
      } catch (err) {
        lastError = 'load: ' + String(err)
        // Missing or corrupt file: start empty.
      }
    })()

    function prune() {
      const cutoff = Date.now() - MAX_AGE_MS
      while (records.length > 0 && records[0].t < cutoff) records.shift()
    }

    function recordUsage(usage) {
      const input = Number(usage.inputTokens) || 0
      const output = Number(usage.outputTokens) || 0
      const cache = (Number(usage.cacheReadTokens) || 0) + (Number(usage.cacheWriteTokens) || 0)
      if (!Number.isFinite(input) || !Number.isFinite(output) || !Number.isFinite(cache)) return
      if (input <= 0 && output <= 0 && cache <= 0) return
      records.push({ t: Date.now(), input, output, cache })
      prune()
      saveDebounced()
    }

    function computeStats() {
      const dailyMap = {}
      const totals = EMPTY()
      for (const r of records) {
        const key = dayKey(r.t)
        const cell = dailyMap[key] || (dailyMap[key] = EMPTY())
        add(cell, r)
        add(totals, r)
      }

      const now = Date.now()
      const hourBase = Math.floor(now / 3600000) * 3600000 - 23 * 3600000
      const hourly24 = []
      for (let i = 0; i < 24; i++) hourly24.push({ t: hourBase + i * 3600000, input: 0, output: 0, cache: 0, total: 0 })

      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      const daily7 = []
      const dayIndex = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000)
        const t = d.getTime()
        dayIndex[dayKey(t)] = daily7.length
        daily7.push({ t, input: 0, output: 0, cache: 0, total: 0 })
      }

      for (const r of records) {
        const h = Math.floor(r.t / 3600000)
        const hi = h - hourBase / 3600000
        if (hi >= 0 && hi < 24) add(hourly24[hi], r)
        const di = dayIndex[dayKey(r.t)]
        if (di !== undefined) add(daily7[di], r)
      }

      return { dailyMap, hourly24, daily7, totals }
    }

    ctx.effect(() => harness.handle('get-stats', async () => {
      await loaded
      return computeStats()
    }))

    ctx.effect(() => harness.handle('set-workspace-root', async (args) => {
      const root = args && typeof args.root === 'string' && args.root.length > 0 ? args.root : null
      if (root !== null && root !== userRoot) {
        userRoot = root
        saveNow().catch(() => {})
      }
      return { root: userRoot }
    }))

    ctx.on('llm/stream', (options, next) => {
      const inner = next()
      return (async function* measured() {
        for await (const chunk of inner) {
          if (chunk && chunk.type === 'usage' && chunk.usage) recordUsage(chunk.usage)
          yield chunk
        }
      })()
    })

    ctx.effect(() => () => {
      saveNow().catch(() => {})
    })
  },
}
