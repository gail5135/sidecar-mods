import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-11-02T00:00:00Z')
const PANE = {
  plugin: 'usage-panel',
  component: 'Pane',
  requestId: 'usage-panel',
  props: {
    title: '사용량',
    isFocused: false,
    bodyColumns: 30,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('측정값을 받으면 컨텍스트, 5시간, 주간 사용량과 남은 시간을 표시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens: 68_200, window: 200_000, percent: 34 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-11-02T02:14:00Z' },
      { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-11-05T04:00:00Z' },
    ],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: '34%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '68.2K / 131.8K' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '5h' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '23.5%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↻ 2026-11-02, 02:14 UTC' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '7d' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↻ 2026-11-05, 04:00 UTC' })).toBeDefined()
  await ui.unmount()
})

test('한도 정보가 없으면 0%로 표시하지 않고 안내한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /한도 정보가 아직 없습니다/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '다음 응답 후 표시' })).toBeDefined()
  await ui.unmount()
})

const running = (ps: string, lsof = '95569\n') => (_: unknown, e: { argv: readonly string[] }) => ({
  value: {
    exitCode: 0,
    stdout: e.argv[0] === 'lsof' ? lsof : e.argv[0] === 'git' ? 'feature/1234-usage\n' : ps,
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

const CASES: [ps: string, lsof: string, expected: string][] = [
  ['node node_modules/.bin/vite --host 0.0.0.0', '95569\n', 'proxy dev (5173)'],
  ['node vite --proxyType=cloud --rootDept=fasoo', '95569\n', 'proxy cloud:fasoo (5173)'],
  ['', '', '5173 비어 있음'],
  ['python -m http.server', '95569\n', '5173 다른 프로세스가 사용 중 (pid 95569)'],
]

for (const [ps, lsof, expected] of CASES) {
  test(`개발 서버 상태를 패널에 표시한다: ${expected}`, async ($, on) => {
    on('clock.now', () => ({ value: NOW }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: { command: 'usage-panel' } }))
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', running(ps, lsof))

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: expected })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '현재 브랜치: feature/1234-usage' })).toBeDefined()
    await ui.unmount()
  })
}

test('초기화 시각을 시스템 시간대로 표시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-12-09T14:22:00Z' }],
    },
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'date' ? '+0900\n' : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /2026-12-09, 23:22$/ })).toBeDefined()
  await ui.unmount()
})

const LEVELS: [percent: number, color: string][] = [
  [24.9, '#3b82f6'],
  [25, '#22c55e'],
  [49.9, '#22c55e'],
  [50, '#eab308'],
  [74.9, '#eab308'],
  [75, '#f97316'],
  [89.9, '#f97316'],
  [90, '#ef4444'],
  [100, '#ef4444'],
]

for (const [percent, color] of LEVELS) {
  test(`${percent}%는 ${color}로 표시한다`, async ($, on) => {
    on('clock.now', () => ({ value: NOW }))
    on('session.measure', (_, e) => ({ changed: e.changed }))

    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: percent }],
      changed: ['rateLimits'],
    })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const label = await ui.find({ type: 'Text', text: `${percent}%` })
    expect(label?.props.color).toBe(color)
    await ui.unmount()
  })
}

const BRANCHES: [name: string, branch: readonly [exitCode: number, stdout: string], expected: string | null][] = [
  ['detached HEAD면 커밋 해시를 표시한다', [0, ''], '현재 브랜치: detached abc1234'],
  ['저장소 밖이면 브랜치 줄을 표시하지 않는다', [128, ''], null],
]

for (const [name, [exitCode, stdout], expected] of BRANCHES) {
  test(name, async ($, on) => {
    on('clock.now', () => ({ value: NOW }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: { command: 'usage-panel' } }))
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', (_, e) => {
      const isBranch = e.argv[1] === 'branch'

      return {
        value: {
          exitCode: isBranch ? exitCode : 0,
          stdout: isBranch ? stdout : e.argv[0] === 'git' ? 'abc1234\n' : '',
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }
    })

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const row = await ui.find({ type: 'Text', text: /^현재 브랜치:/ })
    expect(row?.text).toBe(expected ?? undefined)
    await ui.unmount()
  })
}

const asked = (uuid: string, text: string, kind: 'composer' | 'task-notification' = 'composer') =>
  ({
    uuid,
    door: 'prompt',
    origin: { kind },
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
  }) as const

test('사용자 질문만 기록하고, 이동에 실패하면 안내한다', async ($, on) => {
  const toasts: string[] = []
  on('session.append', (_, e, next) => next(e))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })

  for (const row of [
    asked('m1', '첫 번째 질문'),
    asked('m1', '첫 번째 질문'),
    asked('m2', '두 번째 질문'),
    asked('n1', '알림', 'task-notification'),
    asked('c1', '/usage-panel'),
  ]) {
    await $.session.append(row as never)
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 2개 (1~2)' })).toBeDefined()
  expect(await ui.find({ key: 'm2' })).toBeDefined()
  expect(await ui.find({ key: 'n1' })).toBeUndefined()
  await ui.press({ key: 'm1' })
  // 테스트 환경에는 대화 화면이 없으므로 이동 호출이 실패해 안내가 표시된다.
  for (let tries = 0; tries < 20 && toasts.length === 0; tries += 1) await Promise.resolve()
  expect(toasts).toEqual(['이 질문의 위치로 이동할 수 없습니다.'])
  await ui.unmount()
})

test('/clear 하면 질문 로그를 비운다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.append', (_, e, next) => next(e))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  await $.session.append(asked('m1', '질문') as never)

  await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } as never })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 0개' })).toBeDefined()
  await ui.unmount()
})

test('세션의 커밋을 브랜치별로 표시하고, 커밋이 없는 워크트리는 숨긴다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    const stdout = argv.includes('worktree list')
      ? 'worktree /a\nHEAD 1\nbranch refs/heads/develop\n\nworktree /b\nHEAD 2\nbranch refs/heads/feature/x\n\nworktree /c\nHEAD 3\ndetached\n\n'
      : argv.includes('config user.name')
        ? '이해창\n'
        : argv.includes('-C /b log')
          ? 'abc1234\tfeat: 새 기능\n'
          : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'feature/x' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'abc1234 feat: 새 기능' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'develop' })).toBeUndefined()
  await ui.unmount()
})

test('실행 중인 subagent를 먼저 표시하고 끝난 항목은 뒤에 표시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: '코드 탐색', status: 'completed' },
      { id: 'a2', type: 'general-purpose', description: '테스트 작성', status: 'running' },
      { id: 'a3', type: 'Plan', description: '설계 검토', status: 'failed' },
    ],
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 60 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Subagent (실행 중 1)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● general-purpose · 테스트 작성' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ Explore · 코드 탐색' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ Plan · 설계 검토' })).toBeDefined()
  await ui.unmount()
})

test('모델 이름과 비용을 표시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 187.24 } },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$187.24' })).toBeDefined()
  await ui.unmount()
})

test('질문은 최신 5개만 표시하고 전체 개수를 함께 표시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => next(e))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })

  for (let index = 1; index <= 120; index += 1) {
    await $.session.append(asked(`q${index}`, `질문 ${index}`) as never)
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 120개 (116~120)' })).toBeDefined()
  expect(await ui.find({ key: 'q120' })).toBeDefined()
  expect(await ui.find({ key: 'q116' })).toBeDefined()
  expect(await ui.find({ key: 'q115' })).toBeUndefined()
  await ui.unmount()
})

test('이전, 다음 버튼으로 질문 페이지를 이동한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => next(e))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })

  for (let index = 1; index <= 7; index += 1) {
    await $.session.append(asked(`q${index}`, `질문 ${index}`) as never)
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 7개 (6~7)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2 / 2' })).toBeDefined()
  expect(await ui.find({ key: 'q7' })).toBeDefined()
  expect(await ui.find({ key: 'q6' })).toBeDefined()
  expect(await ui.find({ key: 'q5' })).toBeUndefined()
  expect(await ui.find({ key: 'questions-newer' })).toBeUndefined()

  await ui.press({ key: 'questions-older' })
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 7개 (1~5)' })).toBeDefined()
  expect(await ui.find({ key: 'q5' })).toBeDefined()
  expect(await ui.find({ key: 'q1' })).toBeDefined()
  expect(await ui.find({ key: 'q6' })).toBeUndefined()
  expect(await ui.find({ key: 'questions-older' })).toBeUndefined()

  // 이전 페이지를 보는 중에 새 질문이 들어와도 목록이 밀리지 않는다.
  await $.session.append(asked('q8', '질문 8') as never)
  expect(await ui.find({ type: 'Text', text: '질문 로그 · 총 8개 (1~5)' })).toBeDefined()

  await ui.press({ key: 'questions-newer' })
  expect(await ui.find({ key: 'q8' })).toBeDefined()
  await ui.unmount()
})

test('질문이 5개 이하면 페이지 버튼을 표시하지 않는다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => next(e))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })

  for (let index = 1; index <= 5; index += 1) {
    await $.session.append(asked(`q${index}`, `질문 ${index}`) as never)
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '1 / 1' })).toBeUndefined()
  await ui.unmount()
})

test('메인 루프의 effort를 모델 옆에 표시하고 subagent의 값은 무시한다', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('clock.every', () => ({ value: undefined }) as never)
  on('turn.step', async function* (_, e) {
    yield { kind: 'text', index: 0, text: 'x' } as never

    return { turnId: e.turnId, index: e.index, answer: 'x', toolUses: [] } as never
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const step = { turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 }
  for await (const _ of $.turn.step({ ...step, effort: 'xhigh' })) void _
  for await (const _ of $.turn.step({ ...step, effort: 'low', agentId: 'a1' })) void _

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'xhigh' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'low' })).toBeUndefined()
  await ui.unmount()
})

const AGENT_LIST = [{ id: 'a2', type: 'Explore', description: '탐색', status: 'running' }]

test('subagent를 누르면 해당 화면을 열고, 그 화면에서는 메인 복귀 버튼을 표시한다', async ($, on) => {
  const views: unknown[] = []
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('agent.list', () => ({ value: AGENT_LIST }) as never)
  on('ui.view', (_, e) => {
    views.push(e)

    return { value: {} } as never
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const main = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await main.find({ key: 'agent-main' })).toBeUndefined()
  await main.press({ key: 'a2' })
  expect(JSON.stringify(views[0])).toContain('a2')
  await main.unmount()

  const viewed = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, view: { agentId: 'a2' } },
    surface: 'terminal',
  })
  await viewed.press({ key: 'agent-main' })
  expect(JSON.stringify(views[1])).not.toContain('a2')
  await viewed.unmount()
})
