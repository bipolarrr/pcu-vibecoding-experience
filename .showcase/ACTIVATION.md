# 기능 활성화 절차

## 작업 경로와 현재 상태

시연 세션의 시작 경로는 `.showcase/`이다. 아래 파일 경로와 검증 명령은 모두 Git 저장소 루트 기준이다. 명령 실행 시 작업 디렉터리를 루트로 지정한다.

1. `src/features/enabled.js` 전체, `src/features/`, 현재 Git diff를 확인한다. 미커밋·untracked 파일도 현재 시연 상태에 포함한다.
2. `CATALOG.md`에서 요청에 대응하는 최소 기능을 선택하고 `packs/<id>/manifest.json`의 `requires`, `conflicts`, `replaces`를 확인한다.
3. 추가·제거할 기능과 최종 등록 순서를 정한다. 선행 기능을 먼저 배치하고 `controls-help`는 마지막에 배치한다. 요청과 무관한 기존 기능은 유지한다. 남은 기능에 필요한 의존 기능은 제거하지 않는다.

## 파일 변경

1. 미활성 기능의 내용을 `src/features/<id>/`에 이관한다. 이미 존재하는 폴더는 먼저 확인하며, 기존 수정 내용을 일괄 덮어쓰지 않는다.
2. 기능 파일을 준비한 뒤 `enabled.js`의 기존 import 구역과 기존 배열을 한 번의 편집으로 갱신한다. 편집 도구의 성공·실패가 불명확하면 파일 전체를 다시 읽고 재시도한다.
3. `enabled.js`에 `>>`, append 또는 문자열 이어붙이기로 선언을 추가하지 않는다. 기존 배열을 남긴 채 두 번째 `export const enabledFeatures`를 작성하지 않는다. 주석의 예시를 실제 등록으로 판단하지 않는다.
4. 기능별 import와 배열 항목은 각각 하나만 유지한다. import만 있으면 기존 배열에 등록하고, 배열 항목만 있으면 import를 보완한다. 둘 다 있으면 추가 작업을 생략한다.
5. 기능 제거 시 남은 기능의 의존 관계를 확인한 뒤 대상 import·배열 항목·폴더만 제거한다. 오류 복구를 이유로 활성 목록 전체를 비우거나 저장소를 초기화하지 않는다.
6. 변경 후 파일 전체와 diff를 다시 읽는다. 누적 기능 보존, 선언·등록 중복 부재, import 경로의 실재, 의존 순서를 확인한다. `src/core/` 수정이나 기능 관리 CLI 작성으로 활성화 절차를 대체하지 않는다.

아래 예시는 `ghost`만 활성화된 상태에서 `score`를 요청받은 경우의 최종 파일 형태이다. 실제 작업에서는 현재 활성 기능을 모두 반영한다. 이 코드를 기존 파일 끝에 추가하지 않는다.

```js
import ghost from "./ghost/index.js";
import score from "./score/index.js";

export const enabledFeatures = [ghost, score];
```

## 완료 검증

저장소 루트에서 다음 명령을 각각 실행하고 종료 코드가 `0`인지 확인한다.

```sh
node --check src/features/enabled.js
node --test .showcase/activation.test.js
node --test
```

`.showcase/activation.test.js`는 현재 작업 트리의 진입 파일과 활성 기능 JavaScript의 문법을 검사한다. 숨김 디렉터리의 테스트가 기본 탐색에 포함된다고 가정하지 않고 명시적으로 실행한다. 이 검사는 import 대상의 존재, 설치 시 오류, UI 동작까지 보장하지 않는다.

브라우저에서는 완성형 검증 페이지뿐 아니라 **현재 활성 목록을 사용하는 실제 `index.html`**을 확인한다.

- 새로고침 후 `window.__TETRIS__` 생성과 보드 표시, 블록의 자동 낙하를 확인한다.
- 좌우 이동·회전·한 칸 낙하 등 기존 조작과 요청 기능의 실제 동작을 확인한다. 점수 요청은 최초 표시와 `↓` 입력 후 증가를 모두 확인한다.
- 중복 UI가 없고 console·page error 및 module 요청 실패가 없는지 확인한다.
- 한국어·영어·일본어·베트남어·중국어 간체로 UI를 확인한다. 새 문구가 있으면 모든 사전의 키 정합과 하드코딩 부재도 검증한다.

실패하면 관련 변경만 수정한 뒤 검증을 반복한다. 브라우저를 실행할 수 없으면 미검증 사실을 명시하며 정상 동작을 확인하였다고 보고하지 않는다.

## 점수 활성화 오류 분석

복구 직전 `enabled.js`에는 `import score`와 `export const enabledFeatures = [score]`가 각각 두 번 존재하였다. `node --check`에서 `SyntaxError: Identifier 'score' has already been declared`를 확인하였다. 같은 모듈의 중복 선언으로 구문 분석이 실패하여 `src/main.js`의 게임 초기화가 실행되지 않은 것이 직접 원인이다.

기존 `tests/catalog.test.js`의 기준 상태 검사는 `git show HEAD:src/features/enabled.js`를 확인한다. 현재 작업 트리의 활성 목록을 파싱하지 않으므로 이번 문법 오류를 검출하는 검사로 사용할 수 없다. 이에 현재 파일의 문법 검사를 별도 필수 단계로 추가하였다.

당시 모델의 편집 명령 및 검증 실행 기록은 이 분석에서 확인하지 않았다. 중복 선언이라는 결과는 확인되었으나 append 사용, 재시도 과정, 검증 생략 여부 및 모델 내부 판단은 단정하지 않는다.

EOD
