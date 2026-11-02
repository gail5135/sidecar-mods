import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'verify-checklist',
  component: 'Pane',
  requestId: 'verify-checklist',
  props: {
    title: '검증',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const PORCELAIN = ' M src/main/react/src/hooks/unreadSyncModel.ts\n?? tools/x.txt\n M pom.xml\n'

test('변경 파일에 맞는 검증을 표시하고, 실행 결과와 수정 후 초기화를 반영한다', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: PORCELAIN, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'git status' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '변경된 프론트 파일 1개' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ 안읽음 동기화' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /공지 에디터/ })).toBeUndefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm run test:unread' })
  const passed = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await passed.find({ type: 'Text', text: '✓ 안읽음 동기화' })).toBeDefined()
  await passed.unmount()

  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  const reset = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await reset.find({ type: 'Text', text: '○ 안읽음 동기화' })).toBeDefined()
  await reset.unmount()
})
