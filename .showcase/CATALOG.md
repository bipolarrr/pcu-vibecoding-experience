# 기능 팩 목록

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

각 프리셋은 `palette`, `typography`, `layout`, `board-skin`, `background`, `chrome`의 여섯 축으로 구성한다.

- 네온 아케이드: 각 축의 `-neon` 변형
- 클래식 픽셀: 각 축의 `-pixel` 변형
- 미니멀 현대형: 각 축의 `-minimal` 변형

한 축만 요청한 경우 해당 축의 변형만 교체한다. 전체 스타일 요청인 경우 여섯 축을 같은 프리셋으로 정합한다.

## 선택형 고급 규칙

| 요청 의도 | 기능 ID | 선행 기능 |
|---|---|---|
| 벽 근처 회전 보정 | `srs` | 없음 |
| T-spin 판정과 점수 | `tspin` | `srs`, `score` |
| 연속 라인 제거 보너스 | `combo` | `score` |
| 고난도 제거 연속 보너스 | `back-to-back` | `score` |

## 표준 완성 상태

표준 기능 표의 모든 기능과 선택된 디자인 프리셋 하나를 활성화한다. 선택형 고급 규칙은 제외한다. `enabled.js`에서는 선행 기능을 먼저 배치하고 `controls-help`를 활성 기능 목록의 마지막에 배치한다.
