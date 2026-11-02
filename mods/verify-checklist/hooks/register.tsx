import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CheckResult } from '../types'
import { parseChangedFiles, requiredChecks } from './rules'

const PANE = 'verify-checklist'
const TITLE = '검증'

const changedFiles = atom({ plugin: 'verify-checklist', key: 'changedFiles' } as const, [])
const results = atom({ plugin: 'verify-checklist', key: 'results' } as const, {})

const refreshFiles = async ($: EngineInterface) => {
  const status = await $.process.run(['git', '-c', 'core.quotepath=off', 'status', '--porcelain', '-uall'])
  if (status.exitCode === 0) await update($, changedFiles, () => parseChangedFiles(status.stdout))
}

const MARKS: Record<CheckResult, string> = { passed: '✓', failed: '✗' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'verify-checklist', description: '변경 파일에 필요한 검증 목록을 엽니다' })

    return started
  })

  on('command.run', { command: 'verify-checklist' }, async $ => {
    await refreshFiles($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? '검증 패널을 열었습니다.' : `검증 패널이 대기 중입니다: ${opened.reason}` }
  })

  // 파일을 고치면 이전 통과 결과는 더 이상 유효하지 않다.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      await update($, results, () => ({}))
      await refreshFiles($)
    }

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const files = await read($, changedFiles)
    const executed = requiredChecks(files).filter(check => e.command.includes(check.command))
    if (executed.length > 0) {
      const result: CheckResult = ran.isError === true ? 'failed' : 'passed'
      await update($, results, current => ({
        ...current,
        ...Object.fromEntries(executed.map(check => [check.command, result])),
      }))
    }
    await refreshFiles($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const files = await read($, changedFiles)
    const done = await read($, results)
    const checks = requiredChecks(files)

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{`변경된 프론트 파일 ${files.length}개`}</Text>
        {checks.length === 0 && <Text dimColor>필요한 검증이 없습니다.</Text>}
        {checks.map(check => {
          const result = done[check.command]

          return (
            <Box flexDirection="column">
              <Text color={result === 'passed' ? 'success' : result === 'failed' ? 'error' : undefined}>
                {`${result ? MARKS[result] : '○'} ${check.label}`}
              </Text>
              <Text dimColor>{check.command}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
