import { expect, test } from 'claude-code/testing'

const R = '/repo/src/main/react'

test('생성 파일, SVG 원본, 생성기 수정을 차단하고 일반 파일은 허용한다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const edit = (file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })

  expect((await edit(`${R}/public/meta/NOTICE.txt`)).deny).toBeDefined()
  expect((await edit(`${R}/public/meta/oss-licenses.json`)).deny).toBeDefined()
  expect((await edit(`${R}/src/assets/icons/fill_me.svg`)).deny).toBeDefined()
  expect((await edit(`${R}/src/scripts/generate-sprite.ts`)).deny).toBeDefined()
  expect((await edit(`${R}/src/App.jsx`)).deny).toBeUndefined()
  expect((await edit(`${R}/public/meta/release-notes/ko.json`)).deny).toBeUndefined()
})

test('아이콘은 새 파일 추가만 허용한다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('old.colored.svg') }))
  const write = (file_path: string) => $.tool.call({ tool: 'Write', file_path, content: '<svg/>' })

  expect((await write(`${R}/src/assets/icons/old.colored.svg`)).deny).toBeDefined()
  expect((await write(`${R}/src/assets/icons/old_blue.colored.svg`)).deny).toBeUndefined()
})

test('react-mentions 레지스트리 설치만 차단한다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const bash = (command: string) => $.tool.call({ tool: 'Bash', command })

  expect((await bash('npm i react-mentions')).deny).toBeDefined()
  expect((await bash('npm install -D react-mentions@4.4.0 && ls')).deny).toBeDefined()
  expect((await bash('npm install')).deny).toBeUndefined()
  expect((await bash('npm i ./.yalc/react-mentions')).deny).toBeUndefined()
  expect((await bash('grep react-mentions package.json')).deny).toBeUndefined()
})
