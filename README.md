# sidecar-mods

Claude Code를 쓸 때 채팅 옆에 필요한 정보를 띄우고, 실수하기 쉬운 작업을 막아 주는 개인용 mod 모음입니다.

## Mods

| Mod | 적용 범위 | 역할 |
|---|---|---|
| [`usage-panel`](mods/usage-panel) | 모든 프로젝트 | 사용량, subagent, 커밋, 질문 로그를 패널에 표시 |
| [`git-guard`](mods/git-guard) | 모든 프로젝트 | 명시적인 지시가 없는 `git commit`, `git push` 차단 |
| [`protected-files-guard`](mods/protected-files-guard) | Fireside 프론트 | 생성 파일, SVG 원본, 스프라이트 생성기 수정과 `react-mentions` 설치 차단 |
| [`verify-checklist`](mods/verify-checklist) | Fireside 프론트 | 변경 파일에 필요한 검증 명령과 실행 결과를 패널에 표시 |

### usage-panel

세션이 시작되면 패널이 자동으로 열립니다. 닫은 뒤에는 `/usage-panel`로 다시 열 수 있습니다.

- 모델과 effort, 컨텍스트, 5시간·주간 한도, 비용
- Vite 개발 서버의 proxy preset(5173 포트)과 현재 브랜치
- 실행 중이거나 끝난 subagent. 누르면 해당 화면으로 이동합니다.
- 이번 세션에서 만든 워크트리별 커밋
- 질문 로그. 누르면 해당 질문 위치로 이동합니다.

### git-guard

가장 최근에 직접 입력한 메시지에 "커밋해줘", "푸시해줘", "커밋하고 푸시해줘" 같은 지시가 있어야 `git commit`과 `git push`를 허용합니다.

- 커밋과 푸시는 따로 판단합니다. "커밋해줘"만으로는 푸시할 수 없습니다.
- "커밋하지 마"처럼 부정하는 표현은 지시로 보지 않습니다.
- 알림, 예약 작업, 다른 에이전트의 메시지도 지시로 보지 않습니다.

### protected-files-guard

`src/main/react/` 아래의 다음 작업을 차단합니다.

- `public/meta/`의 `oss-licenses.json`, `NOTICE.txt`, `THIRD_PARTY_NOTICES.txt` 수정
- `src/assets/icons/*.svg` 수정이나 덮어쓰기. 새 아이콘 추가는 허용합니다.
- `src/scripts/generate-sprite.ts` 수정

`react-mentions`를 레지스트리에서 설치하는 `npm` 명령도 차단합니다. 이 패키지는 `.yalc`의 패치 버전을 사용합니다.

### verify-checklist

`/verify-checklist`로 패널을 엽니다. 변경된 프론트 파일에 필요한 검증 명령을 보여 주고, 명령을 실행하면 성공·실패를 표시합니다. 파일을 수정하면 결과가 초기화됩니다.

검증 규칙은 [`hooks/rules.ts`](mods/verify-checklist/hooks/rules.ts)에 있으며, Fireside의 `src/main/react/CLAUDE.md`에 있는 "Verification by affected area" 표를 옮긴 것입니다.

## 설치

저장소를 받아 마켓플레이스로 등록한 뒤 필요한 mod를 설치합니다.

```sh
git clone https://github.com/gail5135/sidecar-mods.git ~/.claude/sidecar-mods
claude plugin marketplace add ~/.claude/sidecar-mods

claude plugin install usage-panel@sidecar-mods
claude plugin install git-guard@sidecar-mods
claude plugin install protected-files-guard@sidecar-mods
claude plugin install verify-checklist@sidecar-mods
```

설치한 뒤 Claude Code를 재시작하거나 `/reload-plugins`를 실행합니다.

mod는 등록한 폴더를 직접 읽으므로 폴더를 지우거나 옮기면 동작하지 않습니다.

## 개발

```sh
claude plugin validate .                # 마켓플레이스 검증
claude plugin validate mods/git-guard   # mod 검증
claude plugin test mods/git-guard       # mod 테스트
```
