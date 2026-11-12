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
  ['커밋하셈', 'git commit -m "x"', true],
  ['커밋 좀 하셈', 'git commit -m "x"', true],
  ['커밋하셈', 'git push', false],
  ['푸시하셈', 'git push', true],
  ['푸시하셈', 'git commit -m "x"', false],
  ['커밋하고 푸시하셈', 'git add . && git commit -m "x" && git push', true],
  ['커밋하지 마셈', 'git commit -m "x"', false],
  ['푸시하지 마셈', 'git push', false],
  ['버튼 고쳐줘', 'git -C /repo commit -m x', false],
  ['버튼 고쳐줘', 'git status', true],
  ['버튼 고쳐줘', 'git log --grep commit', true],
  ['버튼 고쳐줘', 'git pull', true],

  // 표기 변형
  ['푸쉬해줘', 'git push', true],
  ['커밋하고 푸쉬해줘', 'git commit -m "x" && git push', true],
  ['이거 commit해줘', 'git commit -m "x"', true],
  ['이거 push해줘', 'git push', true],

  // 짧은 말투와 다른 동사
  ['커밋 ㄱ', 'git commit -m "x"', true],
  ['커밋 ㄱㄱ', 'git commit -m "x"', true],
  ['커밋 고', 'git commit -m "x"', true],
  ['커밋 고고', 'git commit -m "x"', true],
  ['커밋 가자', 'git commit -m "x"', true],
  ['푸시 ㄱ', 'git push', true],
  ['커밋 푸시 ㄱ', 'git commit -m "x" && git push', true],
  ['커밋할래?', 'git commit -m "x"', true],
  ['커밋합시다', 'git commit -m "x"', true],
  ['커밋하면 돼', 'git commit -m "x"', true],
  ['커밋 쳐줘', 'git commit -m "x"', true],
  ['커밋 남겨줘', 'git commit -m "x"', true],
  ['커밋 만들어줘', 'git commit -m "x"', true],
  ['커밋 날려줘', 'git commit -m "x"', true],
  ['커밋해도 돼', 'git commit -m "x"', true],

  // 어미에 상관없이 하/해/할/합으로 이어지면 지시
  ['커밋하죠', 'git commit -m "x"', true],
  ['커밋하시죠', 'git commit -m "x"', true],
  ['커밋합쇼', 'git commit -m "x"', true],
  ['커밋해주실래요?', 'git commit -m "x"', true],
  ['커밋해 줄 수 있어?', 'git commit -m "x"', true],
  ['커밋해줘. 근데 이거 왜 이래?', 'git commit -m "x"', true],

  // 의문문과 과거·연결형은 언급
  ['커밋할까?', 'git commit -m "x"', false],
  ['커밋하면 어떻게 돼?', 'git commit -m "x"', false],
  ['커밋하고 푸시 차이가 뭐야?', 'git commit -m "x"', false],
  ['푸시했어?', 'git push', false],
  ['커밋했어', 'git commit -m "x"', false],
  ['커밋하기 전에 테스트 돌려줘', 'git commit -m "x"', false],
  ['커밋하려면 뭐 해야 돼', 'git commit -m "x"', false],
  ['커밋할 때 메시지 규칙 알려줘', 'git commit -m "x"', false],
  ['커밋하다가 에러 났어', 'git commit -m "x"', false],

  // 지시가 아닌 언급은 계속 차단
  ['커밋하는 법 알려줘', 'git commit -m "x"', false],
  ['커밋 고쳐줘', 'git commit -m "x"', false],
  ['커밋해서 생긴 버그 봐줘', 'git commit -m "x"', false],
  ['커밋해야 하나?', 'git commit -m "x"', false],
  ['commit message 어떻게 써?', 'git commit -m "x"', false],
  ['push 권한 있어?', 'git push', false],
  ['commit the fix', 'git commit -m "x"', true],
  ['please push', 'git push', true],

  // 부정은 그 단어에만 적용
  ['커밋하고 푸시는 하지 마', 'git commit -m "x"', true],
  ['커밋하고 푸시는 하지 마', 'git push', false],
  ['커밋해줘, 푸시는 말고', 'git commit -m "x"', true],
  ['커밋해줘, 푸시는 말고', 'git push', false],
  ['커밋하지 말고 푸시만 해줘', 'git push', true],
  ['커밋하지 말고 푸시만 해줘', 'git commit -m "x"', false],
  ['커밋해줘 테스트 깨지지 않게', 'git commit -m "x"', true],
  ["commit this but don't push", 'git push', false],
  ["commit this but don't push", 'git commit -m "x"', true],

  // 올려줘는 커밋·푸시와 이어질 때만 푸시 지시
  ['버전 올려줘', 'git push', false],
  ['PR 올려줘', 'git push', false],
  ['커밋해서 올려줘', 'git push', true],
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
