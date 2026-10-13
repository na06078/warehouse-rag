#!/usr/bin/env bash
# STEP 8 비교 실험: 같은 질문을 RAG 없이(--no-rag) / RAG로 실행해 출력 원문을 저장한다.
cd "$(dirname "$0")/.."
OUT="실험/결과/실행기록"
mkdir -p "$OUT"
run() { # $1=파일이름 $2...=ask.mjs 인자
  local name="$1"; shift
  echo "=== $name 시작 $(date '+%H:%M:%S')"
  node src/ask.mjs "$@" > "$OUT/$name.txt" 2>&1
  echo "=== $name 끝 $(date '+%H:%M:%S') exit=$?"
}
run STEP8_A_RAG없음 "재고 실사 차이가 나면 어떻게 처리해?" --no-rag
run STEP8_A_RAG    "재고 실사 차이가 나면 어떻게 처리해?"
run STEP8_B_RAG없음 "A등급 품목은 얼마나 자주 세?" --no-rag
run STEP8_B_RAG    "A등급 품목은 얼마나 자주 세?"
run STEP8_C_RAG없음 "우리 창고 지금 A-01 재고 몇 개야?" --no-rag
run STEP8_C_RAG    "우리 창고 지금 A-01 재고 몇 개야?"
run STEP8_D_RAG없음 "내일 날씨 어때?" --no-rag
run STEP8_D_RAG    "내일 날씨 어때?"
echo "ALL DONE"
