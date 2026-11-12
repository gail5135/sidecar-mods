# sidecar-mods

Claude Code를 쓸 때 채팅 옆에 필요한 정보를 띄우고, 실수하기 쉬운 작업을 막아 주는 개인용 mod 모음입니다.

## Mods

| Mod | 적용 범위 | 역할 |
|---|---|---|
| [`usage-panel`](mods/usage-panel) | 모든 프로젝트 | 사용량, subagent, 커밋, 질문 로그를 패널에 표시 |
| [`git-guard`](mods/git-guard) | 모든 프로젝트 | 명시적인 지시가 없는 `git commit`, `git push` 차단 |

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
- `커밋`, `commit`, `푸시`, `푸쉬`, `push` 바로 뒤에 하/해/할/합이 오면 어미와 상관없이 지시로 봅니다. 그래서 "합시다", "하죠", "하셈", "해주세요" 모두 통과합니다.
  - "하는", "해서", "해야", "하기", "하려", "하다가", "할 때", "한", "했"처럼 언급에 쓰는 형태는 지시로 보지 않습니다.
- "ㄱ", "고", "가자", "쳐", "남겨", "날려", "만들어", "부탁", "진행"도 지시로 봅니다. 예: "커밋 ㄱ", "커밋 날려줘"
- 단어가 든 문장이 `?`로 끝나면 질문으로 보고 차단합니다.
  - 단 "해줄래?", "해 줄 수 있어?", "해주시겠어요?" 같은 부탁은 지시로 봅니다.
- "하지 마", "말고", "don't" 같은 부정은 해당 단어에만 적용됩니다. "커밋하고 푸시는 하지 마"는 커밋만 허용합니다.
- "올려줘"는 "커밋하고 올려줘"처럼 커밋 뒤에 이어질 때만 푸시 지시로 봅니다. "버전 올려줘"는 푸시가 아닙니다.
- 영어는 "commit the fix", "please push"처럼 문장 맨 앞에 오는 명령문도 지시로 봅니다.
- 알림, 예약 작업, 다른 에이전트의 메시지도 지시로 보지 않습니다.
- `?` 없이 쓴 질문("커밋하면 어떻게 돼")은 통과합니다.

## 설치

저장소를 받아 마켓플레이스로 등록한 뒤 필요한 mod를 설치합니다.

```sh
git clone https://github.com/gail5135/sidecar-mods.git ~/.claude/sidecar-mods
claude plugin marketplace add ~/.claude/sidecar-mods

claude plugin install usage-panel@sidecar-mods
claude plugin install git-guard@sidecar-mods
```

설치한 뒤 Claude Code를 재시작하거나 `/reload-plugins`를 실행합니다.

mod는 등록한 폴더를 직접 읽으므로 폴더를 지우거나 옮기면 동작하지 않습니다.

### 갱신

원격에 올라간 변경을 받아 마켓플레이스를 갱신한 뒤 `/reload-plugins`를 실행합니다.

```sh
git -C ~/.claude/sidecar-mods pull
claude plugin marketplace update sidecar-mods
```

## 개발

```sh
claude plugin validate .                # 마켓플레이스 검증
claude plugin validate mods/git-guard   # mod 검증
claude plugin test mods/git-guard       # mod 테스트
```
