// src/main/react/CLAUDE.md 의 "Verification by affected area" 표를 옮긴 규칙이다.
export const REACT_ROOT = 'src/main/react/'

export type Check = { label: string; command: string; matches: RegExp }

export const CHECKS: Check[] = [
  {
    label: '안읽음 동기화',
    command: 'npm run test:unread',
    matches: /^src\/hooks\/(useUnreadSync|unreadSyncModel)/,
  },
  {
    label: '공지 에디터',
    command: 'npm run test:announcement',
    matches: /^src\/components\/Popup\/AnnouncementEditor\//,
  },
  {
    label: 'Wrapsody Room 크기 조절',
    command: 'npm run test:chat-pane-resize',
    matches: /^src\/components\/Room\/WrapsodyRoom\/(chatPaneResize|wrapsody-room\.scss)/,
  },
  {
    label: '리액션 툴팁',
    command: 'npm run test:reaction-tooltip',
    matches: /^src\/components\/Chat\/MessageBubble\/MessageBubbleTooltip\//,
  },
  {
    label: 'Core Room 접근·생성',
    command: 'node --test src/services/wrapsodyCore/*.test.ts src/utils/wrapsodyCoreRoom.test.ts',
    matches: /^src\/(services\/wrapsodyCore\/|utils\/wrapsodyCoreRoom|hooks\/useCoreRoomAccess)/,
  },
  {
    label: 'WebOffice 미리보기 정책',
    command: 'node --test src/utils/webOfficePreview.test.ts',
    matches: /^src\/utils\/webOfficePreview/,
  },
  {
    label: '메시지 선택·대화 만료',
    command: 'node --test src/utils/messageCheckUtils.test.ts src/utils/convoExpireUtils.test.ts',
    matches: /^src\/utils\/(messageCheckUtils|convoExpireUtils)/,
  },
  {
    label: 'Fireside Info·릴리스 노트',
    command:
      'node --test src/pages/FiresideInfo/*.test.ts src/pages/FiresideInfo/OssLicense/*.test.ts src/pages/FiresideInfo/UpdateHistory/*.test.ts',
    matches: /^(src\/pages\/FiresideInfo\/|public\/meta\/release-notes\/)/,
  },
  { label: '라이선스 스크립트 테스트', command: 'npm run test:licenses', matches: /^src\/scripts\// },
  { label: '라이선스 스크립트 타입', command: 'npm run typecheck:licenses', matches: /^src\/scripts\// },
  {
    label: '공유 UI·entry·의존성 빌드',
    command: 'npm run compile',
    matches:
      /^(src\/(components|hooks|states|styles|platforms|pages)\/|pages\/|vite\.config\.ts$|package(-lock)?\.json$)/,
  },
  {
    label: '타입 검사 (변경 전과 진단 비교)',
    command: 'node_modules/.bin/tsc --noEmit',
    matches: /^src\/.*\.(ts|tsx|js|jsx)$/,
  },
]

// git status --porcelain 출력에서 프론트 경로만 react 루트 기준으로 추린다.
export const parseChangedFiles = (porcelain: string) =>
  porcelain
    .split('\n')
    .filter(line => line.length > 3)
    .map(line => line.slice(3).split(' -> ').pop() ?? '')
    .map(path => path.replace(/^"|"$/g, ''))
    .filter(path => path.startsWith(REACT_ROOT))
    .map(path => path.slice(REACT_ROOT.length))

export const requiredChecks = (files: readonly string[]) =>
  CHECKS.filter(check => files.some(file => check.matches.test(file)))
