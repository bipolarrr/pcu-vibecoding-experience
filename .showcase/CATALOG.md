# 기능 팩 목록

기능 활성화 전 [활성화 절차](ACTIVATION.md)를 적용한다. 현재 `enabled.js`의 선언을 편집하고, 기능별 import·등록 중복이 없는지 확인한 뒤 현재 파일의 문법과 실제 게임 동작을 검증한다.

## 표준 기능

| 요청 의도 | 기능 ID | 선행 기능 |
|---|---|---|
| 즉시 낙하 | `hard-drop` | 없음 |
| 착지 위치 표시 | `ghost` | 없음 |
| 다음 블록 표시 | `next` | 없음 |
| 블록 보관 | `hold` | 없음 |
| 공정한 블록 순서 | `seven-bag` | 없음 |
| 착지 후 조작 여유 | `lock-delay` | 없음 |
| 일시정지 | `pause` | 없음 |
| 점수 | `score` | 없음 |
| 제거 라인 수 | `lines` | 없음 |
| 레벨과 속도 상승 | `level` | 없음 |
| 최고 점수 | `high-score` | `score` |
| 재시작 버튼 | `restart-ui` | 없음 |
| 조작 안내 | `controls-help` | 없음 |
| 시작 카운트다운 | `countdown` | 없음 |
| 전체 화면 | `fullscreen` | 없음 |
| 게임오버 화면 | `game-over-dialog` | 없음 |
| 블록 이동 전환 | `move-motion` | 없음 |
| 착지 강조 | `landing-pulse` | 없음 |
| 라인 제거 애니메이션 | `line-clear-motion` | 없음 |
| 파티클 | `particles` | 없음 |
| 즉시 낙하 궤적 | `drop-trail` | `hard-drop` |
| 화면 흔들림 | `screen-shake` | 없음 |
| 획득 점수 popup | `score-popup` | `score` |
| 이동·회전 효과음 | `input-sfx` | 없음 |
| 착지 효과음 | `lock-sfx` | 없음 |
| 라인·레벨 효과음 | `clear-level-sfx` | 없음 |
| 배경음악 | `bgm` | 없음 |
| 오디오 설정 | `audio-controls` | 없음 |

## 디자인 프리셋

각 프리셋은 `palette`, `typography`, `layout`, `board-skin`, `background`, `chrome`의 여섯 축으로 구성한다. `layout`은 HUD 구성과 내부 간격만 결정하며 게임 전체의 화면 정렬은 변경하지 않는다.

- 네온 아케이드: 각 축의 `-neon` 변형
- 클래식 픽셀: 각 축의 `-pixel` 변형
- 미니멀 현대형: 각 축의 `-minimal` 변형

색상 요청은 `palette`, 글씨·폰트 요청은 `typography`만 교체한다. “네온 느낌의 글씨”처럼 스타일명이 함께 있어도 지정한 요소의 축만 바꾸고, 색상과 폰트를 함께 요청하면 두 축만 교체한다. 방향 없는 폰트·색상 불만에는 취향을 먼저 묻는다. 화면 전체를 특정 분위기로 바꾸라는 요청일 때만 여섯 축을 같은 프리셋으로 정합한다. 두 경우 모두 현재 화면 정렬을 유지한다.

## 화면 정렬

화면 정렬은 디자인 프리셋과 독립적으로 누적한다. 가로 요청은 가로 기능만, 세로 요청은 세로 기능만 교체한다. “가운데” 요청은 가로·세로 중앙 정렬을 함께 활성화하며, “오른쪽 위”처럼 두 방향이 포함된 요청은 각 축의 기능을 함께 활성화한다. 정렬 기능의 내부 선행 기능인 `alignment-frame`은 체험자에게 별도 기능으로 설명하지 않는다.

| 요청 의도 | 기능 ID | 선행 기능 |
|---|---|---|
| 왼쪽 정렬 | `align-x-left` | `alignment-frame` |
| 가로 중앙 정렬 | `align-x-center` | `alignment-frame` |
| 오른쪽 정렬 | `align-x-right` | `alignment-frame` |
| 위쪽 정렬 | `align-y-top` | `alignment-frame` |
| 세로 중앙 정렬 | `align-y-center` | `alignment-frame` |
| 아래쪽 정렬 | `align-y-bottom` | `alignment-frame` |

## 선택형 고급 규칙

| 요청 의도 | 기능 ID | 선행 기능 |
|---|---|---|
| 벽 근처 회전 보정 | `srs` | 없음 |
| T-spin 판정과 점수 | `tspin` | `srs`, `score` |
| 연속 라인 제거 보너스 | `combo` | `score` |
| 고난도 제거 연속 보너스 | `back-to-back` | `score` |

## 표준 완성 상태

표준 기능 표의 모든 기능과 선택된 디자인 프리셋 하나를 활성화한다. 선택형 고급 규칙은 제외하고, 화면 정렬은 현재 활성 상태를 유지한다. `enabled.js`에서는 선행 기능을 먼저 배치하고 `controls-help`를 활성 기능 목록의 마지막에 배치한다.
