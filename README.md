# sidecar-mods

Claude Code 채팅 옆에 정보를 띄우고, 실수하기 쉬운 작업을 막아 주는 mod 모음입니다.

| Mod | 하는 일 |
|---|---|
| `usage-panel` | 사용량, subagent, 커밋, 질문 로그를 패널에 표시 |
| `git-guard` | 명시적인 지시가 없는 `git commit`, `git push` 차단 |
| `protected-files-guard` | Fireside 프론트의 생성 파일, SVG 원본 수정과 `react-mentions` 설치 차단 |
| `verify-checklist` | Fireside 프론트 변경에 필요한 검증 명령과 결과를 패널에 표시 |

## 설치

```sh
git clone https://github.com/gail5135/sidecar-mods.git ~/.claude/sidecar-mods
claude plugin marketplace add ~/.claude/sidecar-mods
claude plugin install usage-panel@sidecar-mods
```

다른 mod도 같은 방법으로 설치한 뒤, Claude Code를 재시작합니다.

## 테스트

```sh
claude plugin test mods/usage-panel
```
