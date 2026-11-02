import { describe, expect, test } from 'claude-code/testing'

const CASES: [prompt: string, command: string, isAllowed: boolean][] = [
  ['버튼 색 고쳐줘', 'git commit -m "x"', false],
  ['커밋 내용 봐줘', 'git commit -m "x"', false],
  ['왜 커밋이 안 되지?', 'git commit -m "x"', false],
  ['커밋하지 마', 'git commit -m "x"', false],
  ['커밋해줘', 'git commit -m "x"', true],
  ['커밋', 'git commit -m "x"', true],
  ['커밋해줘', 'git push', false],
  ['커밋하고 푸시해줘', 'git add . && git commit -m "x" && git push', true],
  ['커밋하고 올려줘', 'git push origin develop', true],
  ['푸시해줘', 'git -C /repo push', true],
  ['버튼 고쳐줘', 'git -C /repo commit -m x', false],
  ['버튼 고쳐줘', 'git status', true],
  ['버튼 고쳐줘', 'git log --grep commit', true],
  ['버튼 고쳐줘', 'git pull', true],
]

describe('git commit, git push 차단', () => {
  for (const [prompt, command, isAllowed] of CASES) {
    test(`"${prompt}" → ${command} → ${isAllowed ? '허용' : '차단'}`, async ($, on) => {
      on('prompt.submit', (_, e) => ({ text: e.text }))
      on('tool.call', () => ({ result: {} }))

      await $.prompt.submit({ text: prompt, wait: false, origin: { kind: 'composer' } })
      const ran = await $.tool.call({ tool: 'Bash', command })

      expect(ran.deny === undefined).toBe(isAllowed)
    })
  }
})

test('시스템이 넣은 메시지는 지시로 인정하지 않는다', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))

  await $.prompt.submit({ text: '커밋해줘', isMeta: true, wait: false, origin: { kind: 'composer' } })
  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })

  expect(ran.deny).toBeDefined()
})

test('작업 알림에 담긴 문구는 지시로 인정하지 않는다', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))

  await $.prompt.submit({ text: '커밋해줘', wait: false, origin: { kind: 'task-notification' } })
  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })

  expect(ran.deny).toBeDefined()
})
