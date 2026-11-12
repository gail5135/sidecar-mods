import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const lastPrompt = atom({ plugin: 'git-guard', key: 'lastPrompt' } as const, '')

// git 뒤의 전역 옵션(-C path, -c k=v 등)을 건너뛰어 하위 명령을 찾는다.
const GIT_ACTION = /\bgit\b(?:\s+-\S+(?:\s+(?!commit\b|push\b)[^\s-]\S*)?)*\s+(commit|push)\b/g

type Action = 'commit' | 'push'

// 영어 단어 앞에 다른 영문자가 붙은 경우(recommit 등)는 제외한다.
const WORDS: Record<Action, RegExp> = {
  commit: /커밋|(?<![a-z])commit(?![a-z])/gi,
  push: /푸시|푸쉬|(?<![a-z])push(?![a-z])/gi,
}

// 단어 바로 뒤에 붙는 조사와 '좀'
const PARTICLE = String.raw`\s*(?:을|를|도|까지|만|은|는)?\s*(?:좀\s*)?`

// 단어 바로 뒤에 하/해/할/합이 오면 어미(합시다, 하죠, 하셈, 해주세요…)와 상관없이 지시로 본다.
// 언급에 쓰이는 형태(하는, 해서, 해야, 하기, 하려, 하다가, 한, 할 때, 했…)는 빠진다.
const ORDER_TAIL = new RegExp(
  `^${PARTICLE}(?:하(?!는|기|려|다)|해(?!서|야)|할(?!\\s*때)|합|ㄱ|고+(?![가-힣])|가자|쳐|남겨|날려|만들어|부탁|진행)` +
    String.raw`|^\s+(?:this|it|please|now)\b`,
  'i',
)

// 단어가 든 문장이 ?로 끝나면 질문이다. 단 '해줄래?', '해 줄 수 있어?' 같은 부탁은 지시로 본다.
const SENTENCE = /^[^.!?\n]*[.!?\n]?/
const REQUEST_QUESTION = /줄래|주실래|주시겠|줄\s*수|할래/

const isQuestion = (after: string) => {
  const sentence = after.match(SENTENCE)?.[0] ?? ''
  return sentence.endsWith('?') && !REQUEST_QUESTION.test(sentence)
}

// 단어 바로 뒤에 오면 그 단어를 금지하는 말
const NEGATED_TAIL = new RegExp(`^${PARTICLE}(?:하지\\s*(?:마|말)|말고|말아|금지|안\\s*해|하면\\s*안)`, 'i')
const NEGATED_HEAD = /(?:don't|do\s+not|never|no)\s+$/i

// 커밋 뒤에 이어지는 푸시 지시('커밋하고 푸시해줘', '커밋해서 올려줘', 'commit and push')
const COMMIT_THEN = String.raw`^\s*(?:하고|해서|한\s*(?:다음|뒤|후)에?|후에?|,|and)?\s*`
const COMMIT_THEN_PUSH = new RegExp(`${COMMIT_THEN}(?:푸시|푸쉬|push(?![a-z]))`, 'i')
const COMMIT_THEN_UPLOAD = new RegExp(`${COMMIT_THEN}올려\\s*(?:줘|주세요|달라)`)

const BARE = /^\s*(?:please\s+)?(?:커밋|commit|푸시|푸쉬|push)\s*[.!]?\s*$/i
// 영어 문장은 맨 앞에 오면 명령문이다('commit the fix', 'please push'). 한국어가 섞인 문장은 제외한다.
const ENGLISH_LEAD = /^\s*(?:please\s+)?$/i
const ENGLISH_WORD = /^[a-z]/i
const HANGUL = /[가-힣ㄱ-ㅎ]/

const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

type Occurrence = { word: string; before: string; after: string }

const occurrences = (action: Action, prompt: string): Occurrence[] =>
  [...prompt.matchAll(WORDS[action])].map(match => {
    const start = match.index ?? 0
    return { word: match[0], before: prompt.slice(0, start), after: prompt.slice(start + match[0].length) }
  })

const isNegated = ({ before, after }: Occurrence) =>
  NEGATED_TAIL.test(after) || NEGATED_HEAD.test(before)

const isOrderedAt = (action: Action, { word, before, after }: Occurrence): boolean => {
  if (isQuestion(after)) return false
  if (ORDER_TAIL.test(after) || (ENGLISH_WORD.test(word) && ENGLISH_LEAD.test(before) && !HANGUL.test(after))) return true
  if (action === 'push') return false

  if (COMMIT_THEN_UPLOAD.test(after)) return true
  if (!COMMIT_THEN_PUSH.test(after)) return false

  // '커밋하고 푸시해줘'와 '커밋하고 푸시는 하지 마'처럼 뒤따르는 푸시에 지시나 금지가 붙으면 커밋도 지시다.
  const [push] = occurrences('push', after)
  return push !== undefined && (isOrderedAt('push', push) || isNegated(push))
}

const isOrdered = (action: Action, prompt: string): boolean => {
  const found = occurrences(action, prompt)

  // 같은 단어를 금지한 곳이 하나라도 있으면 지시로 보지 않는다.
  if (found.some(isNegated)) return false
  if (BARE.test(prompt) && found.length > 0) return true
  if (found.some(at => isOrderedAt(action, at))) return true

  // '커밋하고 올려줘'의 올려줘는 푸시 지시다.
  return action === 'push' && occurrences('commit', prompt).some(({ after }) => COMMIT_THEN_UPLOAD.test(after) && !isQuestion(after))
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
    const actions = [...e.command.matchAll(GIT_ACTION)].map(match => match[1] as Action)
    const blocked = actions.find(action => !isOrdered(action, prompt))

    if (blocked === undefined) return next(e)

    const word = blocked === 'commit' ? '커밋' : '푸시'

    return {
      deny: `git-guard: 가장 최근 사용자 메시지에 명시적인 ${word} 지시가 없어서 git ${blocked}을 차단했습니다. 사용자에게 "${word}해줘"처럼 직접 지시해 달라고 요청하세요.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: 가드 실행에 실패했습니다.` }))
}
