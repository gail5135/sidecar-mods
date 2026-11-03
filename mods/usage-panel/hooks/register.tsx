import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { AgentRow, AskedQuestion, CommitGroup, UsageSnapshot } from '../types'

const PANE = 'usage-panel'
const TITLE = '사용량'
const REFRESH_MS = 15_000
const AGENT_REFRESH_MS = 2_000
// 카드마다 색을 하나씩 정해 테두리, 제목, 핵심 값에 같이 쓴다. 사용량 막대의 단계 색과 겹치지 않게 고른다.
const SERVER_COLOR = '#2dd4bf'
const USAGE_COLOR = '#a78bfa'
const AGENT_COLOR = '#fbbf24'
const COMMIT_COLOR = '#f472b6'
const QUESTION_COLOR = '#38bdf8'
// 달러 지폐의 녹색. 사용량 막대의 초록(#22c55e)보다 탁해서 구분된다.
const COST_COLOR = '#85bb65'

// 필드가 바뀌면 태그를 바꾼다: 이전 버전이 저장한 값은 reload 후에도 남는다.
const snapshot = atom({ plugin: 'usage-panel', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

const devServer = atom({ plugin: 'usage-panel', key: 'devServer' } as const, '')

const gitBranch = atom({ plugin: 'usage-panel', key: 'gitBranch' } as const, '')
const utcOffsetMinutes = atom({ plugin: 'usage-panel', key: 'utcOffsetMinutes' } as const, null)

// null이면 항상 최신 페이지를 따라간다.
const questionPage = atom({ plugin: 'usage-panel', key: 'questionPage' } as const, null)
const effortLevel = atom({ plugin: 'usage-panel', key: 'effortLevel' } as const, '')
const modelName = atom({ plugin: 'usage-panel', key: 'modelName' } as const, '')
const agents = atom({ plugin: 'usage-panel', key: 'agents' } as const, [], { shape: 'agents-1' })
const commitGroups = atom({ plugin: 'usage-panel', key: 'commitGroups' } as const, [], { shape: 'commits-1' })
const questions = atom({ plugin: 'usage-panel', key: 'questions' } as const, [], { shape: 'questions-1' })

const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const ACTIVE_STATUSES = new Set(['pending', 'running', 'waiting', 'idle'])
const SHOWN_FINISHED_AGENTS = 5
const AGENT_MARKS: Record<string, string> = {
  pending: '○',
  running: '●',
  waiting: '○',
  idle: '○',
  completed: '✓',
  failed: '✗',
  killed: '✗',
}
const MAX_COMMITS_PER_BRANCH = 10
const SHOWN_QUESTIONS = 5
const STORED_QUESTION_CHARS = 200

const LIMIT_LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: '$',
}

type Figures = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

const save = async ($: EngineInterface, figures: Figures) => {
  const measuredAt = await $.clock.now()
  const next: UsageSnapshot = {
    contextTokens: figures.context.tokens,
    contextWindow: figures.context.window,
    contextPercent: figures.context.percent,
    rateLimits: figures.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    costUsd: figures.cost?.usd,
    measuredAt,
  }
  await update($, snapshot, () => next)
}

const DEV_PORT = '5173'

const describeDevServer = async ($: EngineInterface) => {
  const listener = await $.process.run(['lsof', '-nP', '-t', `-iTCP:${DEV_PORT}`, '-sTCP:LISTEN'])
  const pid = listener.stdout.trim().split('\n')[0]

  // 서버를 띄우지 않은 상태가 기본이므로 따로 알리지 않는다.
  if (!pid) return ''

  const ps = await $.process.run(['ps', '-o', 'command=', '-p', pid])
  const command = ps.stdout.trim()

  if (!/\bvite\b/.test(command)) return `${DEV_PORT} 다른 프로세스가 사용 중 (pid ${pid})`

  // proxy.config.ts의 기본 preset은 dev이므로 인자가 없으면 dev로 표시한다.
  const proxy = /--proxyType[= ](\S+)/.exec(command)?.[1] ?? 'dev'
  const rootDept = /--rootDept[= ](\S+)/.exec(command)?.[1]

  return `proxy ${proxy}${rootDept ? `:${rootDept}` : ''} (${DEV_PORT})`
}

// 저장소 밖이면 빈 문자열을 돌려주어 패널에 표시하지 않는다.
const describeBranch = async ($: EngineInterface) => {
  const current = await $.process.run(['git', 'branch', '--show-current'])
  if (current.exitCode !== 0) return ''

  const name = current.stdout.trim()
  if (name) return name

  const head = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'])

  return head.exitCode === 0 ? `detached ${head.stdout.trim()}` : ''
}

const refreshDevServer = async ($: EngineInterface) => {
  const text = await describeDevServer($).catch(() => '확인할 수 없음')
  await update($, devServer, () => text)
  const branch = await describeBranch($).catch(() => '')
  await update($, gitBranch, () => branch)
}

// mod 실행 환경의 Date 시간대를 보장할 수 없으므로 시스템 시간대를 직접 읽는다.
const refreshUtcOffset = async ($: EngineInterface) => {
  const date = await $.process.run(['date', '+%z']).catch(() => null)
  const match = /^([+-])(\d{2})(\d{2})$/.exec(date?.stdout.trim() ?? '')
  const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : null
  await update($, utcOffsetMinutes, () => offset)
}

const formatResetDate = (resetsAt: string | undefined, offset: number | null) => {
  const target = resetsAt === undefined ? Number.NaN : Date.parse(resetsAt)
  if (Number.isNaN(target)) return undefined

  const shifted = new Date(target + (offset ?? 0) * 60_000).toISOString()
  const text = `${shifted.slice(0, 10)}, ${shifted.slice(11, 16)}`

  return offset === null ? `${text} UTC` : text
}

const refreshAgents = async ($: EngineInterface) => {
  const list = await $.agent.list().catch(() => null)
  if (list === null) return

  const rows: AgentRow[] = list.map(({ id, type, description, status }) => ({ id, type, description, status }))
  // 2초마다 읽으므로 내용이 바뀌었을 때만 저장해 불필요한 다시 그리기를 막는다.
  const current = await read($, agents)
  if (JSON.stringify(current) !== JSON.stringify(rows)) await update($, agents, () => rows)
}

// 이번 세션 동안 각 워크트리에 사용자 이름으로 남긴 커밋만 모은다.
const collectCommitGroups = async ($: EngineInterface) => {
  const list = await $.process.run(['git', 'worktree', 'list', '--porcelain'])
  if (list.exitCode !== 0) return []

  const author = (await $.process.run(['git', 'config', 'user.name'])).stdout.trim()
  const { startedAt } = await $.session.usage()
  const since = `--since=@${Math.floor(startedAt / 1000)}`
  const groups: CommitGroup[] = []

  for (const block of list.stdout.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]
    if (!path || !branch) continue

    const log = await $.process.run([
      'git',
      '-C',
      path,
      'log',
      since,
      `--author=${author}`,
      '--format=%h%x09%s',
      '-n',
      String(MAX_COMMITS_PER_BRANCH),
    ])
    if (log.exitCode !== 0) continue

    const commits = log.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash = '', ...subject] = line.split('\t')

        return { hash, subject: subject.join('\t') }
      })
    if (commits.length > 0) groups.push({ branch, commits })
  }

  return groups
}

const refreshCommits = async ($: EngineInterface) => {
  const groups = await collectCommitGroups($).catch(() => null)
  if (groups !== null) await update($, commitGroups, () => groups)
}

const rememberQuestion = async ($: EngineInterface, question: AskedQuestion) => {
  await update($, questions, list =>
    list.some(one => one.id === question.id)
      ? list
      : [...list, { ...question, text: question.text.slice(0, STORED_QUESTION_CHARS) }],
  )
}

const isWide = (char: string) => (char.codePointAt(0) ?? 0) >= 0x1100

// 한글은 두 칸을 차지하므로 글자 수가 아니라 칸 수로 자른다.
const clip = (text: string, columns: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  let used = 0
  let result = ''
  for (const char of line) {
    used += isWide(char) ? 2 : 1
    if (used > columns - 1) return `${result}…`
    result += char
  }

  return result
}

const formatTokens = (tokens: number) => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`

  return String(tokens)
}

const barCells = (percent: number, cells: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)

  return { filled: '▰'.repeat(filled), empty: '▱'.repeat(cells - filled) }
}

// claude-opus-5-5[1m] → Opus 5.5
const formatModel = (model: string) => {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  if (!match) return model

  const [, family = '', major, minor] = match

  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

// 첫 모델 요청 전에는 turn.step이 없으므로, 엔진이 셸에 넘기는 현재 effort를 먼저 읽고 없으면 설정값을 쓴다.
const refreshEffort = async ($: EngineInterface) => {
  const fromEnv = await $.env.get('CLAUDE_EFFORT').catch(() => undefined)
  const fromSettings = fromEnv ? undefined : await $.settings.read({ key: 'effortLevel' }).catch(() => undefined)
  const effort = fromEnv || (typeof fromSettings === 'string' ? fromSettings : '')
  if (effort) await update($, effortLevel, () => effort)
}

const refreshModel = async ($: EngineInterface) => {
  const model = await $.session.model().catch(() => '')
  await update($, modelName, () => formatModel(model))
}

// 25%, 50%, 75%, 90%에 도달할 때마다 파랑 → 초록 → 노랑 → 주황 → 빨강으로 바뀐다.
const levelColor = (percent: number) => {
  if (percent >= 90) return '#ef4444'
  if (percent >= 75) return '#f97316'
  if (percent >= 50) return '#eab308'
  if (percent >= 25) return '#22c55e'

  return '#3b82f6'
}

// 사용량 막대와 같은 색을 낮은 단계부터 파랑 → 초록 → 노랑 → 주황 → 빨강 순으로 쓴다.
const EFFORT_COLORS: Record<string, string> = {
  low: '#3b82f6',
  medium: '#22c55e',
  high: '#eab308',
  xhigh: '#f97316',
  max: '#ef4444',
}

export const register: Register = on => {
  let isTicking = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'usage-panel', description: '사용량 패널을 채팅 옆에 엽니다' })
    await save($, await $.session.usage())
    await refreshDevServer($)
    await refreshUtcOffset($)
    await refreshCommits($)
    await refreshAgents($)
    await refreshModel($)
    await refreshEffort($)
    void $.ui.open({ id: PANE, title: TITLE })

    // 초기화까지 남은 시간은 응답이 없어도 줄어들므로 주기적으로 다시 읽는다.
    if (!isTicking) {
      isTicking = true
      $.clock.every(AGENT_REFRESH_MS, () => void refreshAgents($))
      $.clock.every(REFRESH_MS, () => {
        void $.session.usage().then(usage => save($, usage))
        void refreshDevServer($)
        void refreshCommits($)
        void refreshModel($)
      })
    }

    return started
  })

  on('command.run', { command: 'usage-panel' }, async $ => {
    await save($, await $.session.usage())
    await refreshDevServer($)
    await refreshUtcOffset($)
    await refreshCommits($)
    await refreshAgents($)
    await refreshModel($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? '사용량 패널을 열었습니다.' : `사용량 패널이 대기 중입니다: ${opened.reason}` }
  })

  // 커밋은 대부분 Bash로 만들어지므로 15초를 기다리지 않고 바로 반영한다.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    void refreshCommits($)

    return ran
  })

  // /clear 후에는 대화가 사라져 이동할 위치가 없으므로 질문 로그도 비운다.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, questions, () => [])
      await update($, questionPage, () => null)
    }

    return next(e)
  })

  // ui.render 안에서는 상태를 쓸 수 없으므로 대화 행이 저장될 때 기록한다. uuid는 화면 행의 메시지 id와 같다.
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const text = e.message.content
      .flatMap(block => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .trim()
    if (!e.agentId && !e.message.isMeta && text && !text.startsWith('/') && USER_ORIGINS.has(e.origin.kind)) {
      await rememberQuestion($, { id: e.uuid, text })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // effort를 직접 읽는 API가 없어 메인 루프의 모델 요청에서 읽는다. 세션의 설정값이 요청마다 실린다.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = String(e.effort)
      await update($, effortLevel, () => effort)
    }

    return yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    await save($, e)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const data = await read($, snapshot)
    const server = await read($, devServer)
    const branch = await read($, gitBranch)
    const offset = await read($, utcOffsetMinutes)
    const model = await read($, modelName)
    const effort = await read($, effortLevel)
    const groups = await read($, commitGroups)
    const viewedAgentId = e.props.view.agentId
    const agentRows = await read($, agents)
    const activeAgents = agentRows.filter(agent => ACTIVE_STATUSES.has(agent.status))
    const finishedAgents = agentRows.filter(agent => !ACTIVE_STATUSES.has(agent.status)).slice(-SHOWN_FINISHED_AGENTS)
    const asked = await read($, questions)
    // 페이지는 1~5번, 6~10번처럼 고정되므로 새 질문이 들어와도 보고 있는 목록이 밀리지 않는다.
    const lastPage = Math.max(1, Math.ceil(asked.length / SHOWN_QUESTIONS))
    const page = Math.min((await read($, questionPage)) ?? lastPage, lastPage)
    const firstNumber = (page - 1) * SHOWN_QUESTIONS + 1
    const lastNumber = Math.min(page * SHOWN_QUESTIONS, asked.length)
    const shownQuestions = asked
      .slice(firstNumber - 1, lastNumber)
      .map((question, index) => ({ ...question, number: firstNumber + index }))
      .reverse()
    const shownRange = firstNumber === lastNumber ? `(${lastNumber})` : `(${firstNumber}~${lastNumber})`

    // 카드의 테두리와 안쪽 여백이 좌우 2칸씩 차지한다.
    const width = Math.max(8, e.props.bodyColumns - 6)
    const barWidth = Math.max(4, Math.min(12, width - 30))

    if (data === null) return <Text dimColor>사용량을 읽는 중입니다.</Text>

    const contextPercent = data.contextPercent

    return (
      <Box flexDirection="column">
        {(server !== '' || branch !== '') && (
          <Box flexDirection="column" borderStyle="round" borderColor={SERVER_COLOR} paddingX={1}>
            {server !== '' && <Text color={SERVER_COLOR}>{server}</Text>}
            {branch !== '' && (
              <Text>
                <Text dimColor>현재 브랜치:</Text> <Text color={SERVER_COLOR}>{branch}</Text>
              </Text>
            )}
          </Box>
        )}
        <Box flexDirection="column" borderStyle="round" borderColor={USAGE_COLOR} paddingX={1}>
          {model !== '' && (
            <Box flexDirection="row" gap={1}>
              <Text bold color={USAGE_COLOR}>
                {model}
              </Text>
              {effort !== '' &&
                (EFFORT_COLORS[effort] ? <Text color={EFFORT_COLORS[effort]}>{effort}</Text> : <Text dimColor>{effort}</Text>)}
            </Box>
          )}
          <Box flexDirection="row" gap={1}>
            <Box width={3}>
              <Text dimColor>ctx</Text>
            </Box>
            <Box flexDirection="row">
              <Text color={levelColor(contextPercent ?? 0)}>{barCells(contextPercent ?? 0, barWidth).filled}</Text>
              <Text dimColor>{barCells(contextPercent ?? 0, barWidth).empty}</Text>
            </Box>
            <Box width={6}>
              <Text color={contextPercent === undefined ? undefined : levelColor(contextPercent)}>
                {contextPercent === undefined ? '-' : `${contextPercent}%`}
              </Text>
            </Box>
            <Text dimColor>
              {data.contextTokens === undefined
                ? '다음 응답 후 표시'
                : `${formatTokens(data.contextTokens)} / ${formatTokens(Math.max(0, data.contextWindow - data.contextTokens))}`}
            </Text>
          </Box>
          {data.rateLimits.map(limit => (
            <Box flexDirection="row" gap={1}>
              <Box width={3}>
                <Text dimColor>{LIMIT_LABELS[limit.kind] ?? limit.kind}</Text>
              </Box>
              <Box flexDirection="row">
                <Text color={levelColor(limit.percentUsed)}>{barCells(limit.percentUsed, barWidth).filled}</Text>
                <Text dimColor>{barCells(limit.percentUsed, barWidth).empty}</Text>
              </Box>
              <Box width={6}>
                <Text color={levelColor(limit.percentUsed)}>{`${limit.percentUsed}%`}</Text>
              </Box>
              {limit.resetsAt !== undefined && (
                <Text dimColor>{`↻ ${formatResetDate(limit.resetsAt, offset) ?? '-'}`}</Text>
              )}
            </Box>
          ))}
          {data.rateLimits.length === 0 && (
            <Text dimColor>한도 정보가 아직 없습니다. 구독 계정에서 응답을 받으면 표시됩니다.</Text>
          )}
          {data.costUsd !== undefined && (
            <Text bold color={COST_COLOR}>{`$${data.costUsd.toFixed(2)}`}</Text>
          )}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor={AGENT_COLOR} paddingX={1}>
          <Text bold color={AGENT_COLOR}>{`Subagent (실행 중 ${activeAgents.length})`}</Text>
          {agentRows.length === 0 && <Text dimColor>실행한 subagent가 없습니다.</Text>}
          {[...activeAgents, ...finishedAgents].map(agent => {
            const isViewed = agent.id === viewedAgentId
            const isActive = ACTIVE_STATUSES.has(agent.status)
            const label = clip(`${AGENT_MARKS[agent.status] ?? '○'} ${agent.type} · ${agent.description}`, width)

            return (
              <Button
                key={agent.id}
                plain
                onPress={() => {
                  void $.ui
                    .view({ agentId: agent.id })
                    .then(moved => moved.deny === undefined)
                    .catch(() => false)
                    .then(isMoved => {
                      if (!isMoved) $.ui.toast('이 subagent의 화면을 열 수 없습니다.')
                    })
                }}
              >
                <Text bold={isViewed} color={isViewed || isActive ? AGENT_COLOR : undefined} dimColor={!isViewed && !isActive}>
                  {label}
                </Text>
              </Button>
            )
          })}
          {viewedAgentId !== undefined && (
            <Button
              key="agent-main"
              plain
              onPress={() => {
                void $.ui.view({}).catch(() => {
                  $.ui.toast('메인 화면으로 돌아갈 수 없습니다.')
                })
              }}
            >
              <Text color={AGENT_COLOR}>◀◀◀ 메인으로 돌아가기</Text>
            </Button>
          )}
        </Box>
        <Box flexDirection="column" gap={1} borderStyle="round" borderColor={COMMIT_COLOR} paddingX={1}>
          <Text bold color={COMMIT_COLOR}>
            커밋 로그
          </Text>
          {groups.length === 0 && <Text dimColor>이번 세션의 커밋이 없습니다.</Text>}
          {groups.map(group => (
            <Box flexDirection="column">
              <Text bold>{clip(group.branch, width)}</Text>
              {group.commits.map(commit => (
                <Text>
                  <Text color={COMMIT_COLOR}>{commit.hash}</Text>{' '}
                  <Text dimColor>{clip(commit.subject, width - commit.hash.length - 1)}</Text>
                </Text>
              ))}
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor={QUESTION_COLOR} paddingX={1}>
          <Text bold color={QUESTION_COLOR}>
            {asked.length === 0 ? '질문 로그 · 총 0개' : `질문 로그 · 총 ${asked.length}개 ${shownRange}`}
          </Text>
          {asked.length === 0 && <Text dimColor>아직 질문이 없습니다.</Text>}
          {shownQuestions.map(question => {
            const prefix = `${question.number}.`

            return (
              <Button
                key={question.id}
                plain
                onPress={() => {
                  void $.ui
                    .scroll({ to: { requestId: question.id }, block: 'start' })
                    .then(moved => moved.deny === undefined)
                    .catch(() => false)
                    .then(isMoved => {
                      if (!isMoved) $.ui.toast('이 질문의 위치로 이동할 수 없습니다.')
                    })
                }}
              >
                <Text color={QUESTION_COLOR}>{prefix}</Text> <Text>{clip(question.text, width - prefix.length - 1)}</Text>
              </Button>
            )
          })}
          {lastPage > 1 && (
            <Box flexDirection="row" gap={1}>
              {page > 1 ? (
                <Button
                  key="questions-older"
                  plain
                  onPress={() => {
                    void update($, questionPage, () => page - 1)
                  }}
                >
                  <Text color={QUESTION_COLOR}>◀◀◀</Text>
                </Button>
              ) : (
                <Text dimColor>◀◀◀</Text>
              )}
              <Text color={QUESTION_COLOR}>{`${page} / ${lastPage}`}</Text>
              {page < lastPage ? (
                <Button
                  key="questions-newer"
                  plain
                  onPress={() => {
                    void update($, questionPage, () => (page + 1 === lastPage ? null : page + 1))
                  }}
                >
                  <Text color={QUESTION_COLOR}>▶▶▶</Text>
                </Button>
              ) : (
                <Text dimColor>▶▶▶</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
