// 프롬프트 조립: 시스템 메시지와 사용자 메시지(①~⑦)를 만든다.
// 작은 모델은 지시 문장보다 "눈앞에 보이는 모양"을 따라 하므로, 출처 규칙은 실제 모양([WH-012])으로 보여 주고
// 프롬프트 맨 끝(⑦)에서 한 번 더 말한다.
import { WEAK_THRESHOLD } from "./search.mjs";

// 사용자가 직접 정한 챗봇 규칙(제품 결정, 2026-10-13)
export const SYSTEM_MESSAGE =
  "당신은 물류창고 재고 조사 안내 도우미입니다. 주어진 자료에 근거해서만 답합니다. " +
  "주어진 자료와 관련이 없다고 판단되는 질문에는 자료에 없는 내용이라고 사용자에게 알리고 답변하지 않습니다. " +
  "근거로 쓴 자료의 ID를 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 항상 표시합니다.";

const INTRO = "다음 자료는 물류창고 재고 조사에 관한 공개 문서와 현장 SOP에서 뽑은 조각입니다.";
const GROUNDING_NORMAL = "자료에 근거한 내용만 답하고, 자료에 없으면 없다고 말합니다.";
const GROUNDING_WEAK =
  "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, " +
  "근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다.";
const CITATION_RULE = "근거가 된 조각의 ID만 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다.";
const CITATION_REMINDER = "(답할 때 근거로 쓴 자료의 ID를 [WH-012]처럼 문장 끝에 붙입니다.)";

function currentTimeKst(now = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
  }).format(now);
}

export function isWeak(hits) {
  return hits.length === 0 || hits[0].score < WEAK_THRESHOLD;
}

export function buildPrompt(question, hits, now = new Date()) {
  const lines = [
    INTRO, // ① 자료 소개
    isWeak(hits) ? GROUNDING_WEAK : GROUNDING_NORMAL, // ② 근거 원칙
    CITATION_RULE, // ③ 출처 규칙
    `현재 시각은 ${currentTimeKst(now)}(KST)입니다. '지금', '올해', '다음 주' 같은 상대 표현은 이 시각을 기준으로 해석합니다.`, // ④
    "",
    "[자료]", // ⑤ 대괄호 안에는 ID만 (제목까지 넣으면 모델이 머리를 통째로 베낀다)
    hits.map((hit) => `[${hit.id}] (${hit.section}) ${hit.text}`).join("\n\n"),
    "",
    "[질문]", // ⑥
    question,
    "",
    CITATION_REMINDER, // ⑦ 출처 규칙 한 번 더
  ];
  return lines.join("\n");
}

export function buildMessages(question, hits) {
  return [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: buildPrompt(question, hits) },
  ];
}
