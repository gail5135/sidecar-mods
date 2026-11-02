import type { Register } from 'claude-code'

const REACT = '(?:^|/)src/main/react/'
const GENERATED = new RegExp(`${REACT}public/meta/(?:oss-licenses\\.json|NOTICE\\.txt|THIRD_PARTY_NOTICES\\.txt)$`)
const ICON = new RegExp(`${REACT}src/assets/icons/[^/]+\\.svg$`)
const GENERATOR = new RegExp(`${REACT}src/scripts/generate-sprite\\.ts$`)

// .yalc 경로를 지정한 재설치는 허용하고, 레지스트리 패키지 설치만 막는다.
const MENTIONS_INSTALL = /\bnpm\s+(?:i|install|add|up|update)\b[^;&|\n]*\s(?:react-mentions)(?:@\S*)?(?=\s|$|[;&|])/

const reasonFor = (path: string) => {
  if (GENERATED.test(path)) return 'npm run generate:licenses가 만드는 생성 파일이므로 직접 수정할 수 없습니다.'
  if (GENERATOR.test(path)) return '스프라이트 생성기는 수정하지 않습니다. 필요하면 사용자에게 먼저 확인하세요.'

  return undefined
}

const ICON_REASON =
  'SVG 아이콘 원본은 수정하지 않습니다. 색상 변형은 `아이콘이름_{색상}.colored.svg`를 새로 추가하고 npm run generate:sprite를 실행하세요.'

export const register: Register = on => {
  const fail = (name: string) => ({ deny: `${name}: 가드 실행에 실패했습니다.` })

  on('tool.call', { tool: 'Edit' }, ($, e, next) => {
    const reason = reasonFor(e.file_path) ?? (ICON.test(e.file_path) ? ICON_REASON : undefined)

    return reason ? { deny: `${$.plugin.name}: ${reason}` } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : fail($.plugin.name)))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    // 새 아이콘 파일 추가는 위키 규칙에 맞는 작업이므로 기존 파일 덮어쓰기만 막는다.
    const isIconOverwrite = ICON.test(e.file_path) && (await $.fs.exists(e.file_path))
    const reason = reasonFor(e.file_path) ?? (isIconOverwrite ? ICON_REASON : undefined)

    return reason ? { deny: `${$.plugin.name}: ${reason}` } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : fail($.plugin.name)))

  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    MENTIONS_INSTALL.test(e.command)
      ? {
          deny: `${$.plugin.name}: react-mentions는 .yalc의 패치 버전을 사용합니다. 레지스트리에서 설치하면 패치가 덮어써집니다.`,
        }
      : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : fail($.plugin.name)))
}
