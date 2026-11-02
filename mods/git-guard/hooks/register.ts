import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const lastPrompt = atom({ plugin: 'git-guard', key: 'lastPrompt' } as const, '')

// git 뒤의 전역 옵션(-C path, -c k=v 등)을 건너뛰어 하위 명령을 찾는다.
const GIT_ACTION = /\bgit\b(?:\s+-\S+(?:\s+(?!commit\b|push\b)[^\s-]\S*)?)*\s+(commit|push)\b/g

const NEGATED = /(커밋|푸시|commit|push)[^.\n]{0,12}(하지\s*마|말고|말아|금지|않)|(don't|do not|never)\s+(commit|push)/i
const BARE_COMMIT = /^\s*(커밋|commit)\s*[.!]?\s*$/i
const BARE_PUSH = /^\s*(푸시|push)\s*[.!]?\s*$/i

const COMMIT_ORDER =
  /커밋\s*(?:을|를|도|까지|하고|후)?\s*(?:좀\s*)?(?:해|하셈|하자|하세요|진행|부탁|올려|푸시)|(?:^|\s)(?:please\s+)?commit\s+(?:this|it|please|now|and\s+push)|^\s*(?:please\s+)?commit\b/i
const PUSH_ORDER =
  /푸시\s*(?:을|를|도|까지)?\s*(?:좀\s*)?(?:해|하셈|하자|하세요|진행|부탁)|올려\s*(?:줘|주세요|달라)|(?:^|\s)(?:please\s+)?push\s+(?:this|it|please|now)|^\s*(?:please\s+)?push\b|commit\s+and\s+push/i

const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const isOrdered = (action: string, prompt: string) => {
  if (NEGATED.test(prompt)) return false

  return action === 'commit'
    ? BARE_COMMIT.test(prompt) || COMMIT_ORDER.test(prompt)
    : BARE_PUSH.test(prompt) || PUSH_ORDER.test(prompt)
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    // 사용자가 직접 입력한 메시지만 지시로 인정한다. 알림, 예약 작업, 다른 에이전트의 메시지는 제외한다.
    const isTyped = !e.isMeta && !e.command && USER_ORIGINS.has(e.origin.kind)
    await update($, lastPrompt, () => (isTyped ? e.text : ''))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const prompt = await read($, lastPrompt)
    const actions = [...e.command.matchAll(GIT_ACTION)].map(match => match[1] ?? '')
    const blocked = actions.find(action => !isOrdered(action, prompt))

    if (blocked === undefined) return next(e)

    const word = blocked === 'commit' ? '커밋' : '푸시'

    return {
      deny: `git-guard: 가장 최근 사용자 메시지에 명시적인 ${word} 지시가 없어서 git ${blocked}을 차단했습니다. 사용자에게 "${word}해줘"처럼 직접 지시해 달라고 요청하세요.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: 가드 실행에 실패했습니다.` }))
}
