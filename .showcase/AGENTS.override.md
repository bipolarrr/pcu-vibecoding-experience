# 시연 세션 운영 규약

## 시작 상태 확인

1. 첫 작업 전에 Git 저장소 루트에서 `npm run showcase:status`를 실행한다.
2. 명령의 종료 코드가 `10`이면 `npm run showcase:reset`을 실행한다.
3. 복원 후 `npm run showcase:status`를 다시 실행한다.
4. 상태 확인 또는 복원에 실패하면 시연 변경을 중단하고 운영자에게 오류를 보고한다.
5. `npm run showcase:baseline`은 운영자가 명시적으로 요청한 경우에만 실행한다.
6. 시연 세션에서는 Git commit, tag, pull, push를 실행하지 않는다. 운영자가 명시적으로 요청한 경우에만 예외로 한다.

## 적용 범위

저장소 루트의 `AGENTS.md`에 명시된 기능 활성화, 다국어, 검증 및 완료 응답 규약을 함께 적용한다.
