import type { EngineInterface, Register } from 'claude-code'

// Claude Code agent-panel rows, drawn by `statusline subagents` (SPEC
// REQ-SL-004B). This replaces the deprecated `subagentStatusLine` setting: the
// setting ran the command with every task in one payload; Claude Code's mods
// API instead asks a `ui.render` hook for one `AgentRow` at a time, so this
// module builds a one-task payload from the row's AgentInfo and feeds it to the
// same command. The model glyphs, effort dial and context gauge therefore stay
// in src/main.zig, not in a second table here.
//
// Claude Code only: Codex reads hooks/activity-hooks.json through its manifest
// and never loads this file.

// The SubagentTask fields REQ-SL-004B reads, mapped from AgentInfo. Only these
// go into the payload, so the cache key below changes only when the rendered
// row could.
type SubagentTask = {
  id: string
  name?: string
  agentType: string
  description: string
  label: string
  model?: string
  effort?: string | number
  contextWindowSize?: number
  tokenCount: number
}

// Rendered bodies by payload. Claude Code re-asks each row every five seconds
// and on every status change; most asks carry an unchanged payload, so this
// keeps the panel from spawning a process per row per tick. `undefined` is
// cached too, so a task the renderer declines is not retried until it changes.
// Cleared whole at the limit: a long session cannot grow it without bound, and
// the cost of a clear is one render per visible row.
const CACHE_LIMIT = 256
const cache = new Map<string, string | undefined>()

export const register: Register = on => {
  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    const p = e.props
    const task: SubagentTask = {
      id: p.id,
      name: p.name,
      agentType: p.type,
      description: p.description,
      label: p.label,
      model: p.model,
      effort: p.effort,
      contextWindowSize: p.contextWindowSize,
      tokenCount: p.tokenCount,
    }
    const payload = JSON.stringify({ tasks: [task] })

    let body: string | undefined
    if (cache.has(payload)) {
      body = cache.get(payload)
    } else {
      body = await render($, payload, p.id)
      if (cache.size >= CACHE_LIMIT) cache.clear()
      cache.set(payload, body)
    }

    // No body: the renderer skipped the task or could not run. Pass the row on
    // untouched so Claude Code draws its own, as the setting did.
    if (body === undefined) return next(e)
    return next({ ...e, props: { ...p, body } })
  })
}

// Runs the renderer and returns the row body for `id`, or undefined when no
// binary runs, it fails, or it skipped the task. Binary resolution follows
// statusline-activity-hook.sh: AGENT_STATUSLINE_BIN, else `statusline` on PATH.
async function render(
  $: EngineInterface,
  payload: string,
  id: string,
): Promise<string | undefined> {
  const bin = (await $.env.get('AGENT_STATUSLINE_BIN')) || 'statusline'
  try {
    // 2 s, not the 30 s default: a stuck renderer should cost one row its
    // custom body, not hold the row's answer for half a minute.
    const { exitCode, stdout } = await $.process.run([bin, 'subagents'], {
      stdin: payload,
      timeoutMs: 2000,
    })
    if (exitCode !== 0) return undefined
    for (const line of stdout.split('\n')) {
      if (line === '') continue
      const row = JSON.parse(line) as { id?: unknown; content?: unknown }
      if (row.id === id && typeof row.content === 'string') return row.content
    }
  } catch (err) {
    $.ui.log(`agent-statusline: ${bin} subagents failed: ${String(err)}`, { to: 'debug' })
  }
  return undefined
}
