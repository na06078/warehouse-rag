// 실험: 임베딩 벡터를 만드는 두 방식 비교 (정식 검색 경로는 바꾸지 않음)
//  A. 가이드 방식  : pipeline("feature-extraction") + mean pooling + 정규화  (= src/embedder.mjs)
//  B. 모델 카드 방식: AutoModel 출력 sentence_embedding (모델 카드 예시 코드와 같은 방식)
// 두 방식 모두 같은 모델·같은 q8·같은 접두어를 쓴다. 다른 것은 "벡터를 꺼내는 위치" 하나뿐.
// 실행: node 실험/임베딩_방식_비교.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { AutoModel, AutoTokenizer } from "@huggingface/transformers";
import { embedDocument, embedQuery, formatDocument, formatQuery, MODEL, DTYPE } from "../src/embedder.mjs";

const QUESTIONS = [
  ["재고 실사 차이가 나면 어떻게 처리해?", "정상"],
  ["실사 수량이 장부랑 안 맞으면?", "다른 표현"],
  ["ABC 분석이 뭐야?", "정상"],
  ["RFID랑 바코드 차이", "정상"],
  ["안전재고는 어떻게 계산해?", "경계"],
  ["A등급 품목은 얼마나 자주 세?", "경계"],
  ["우리 창고 지금 A-01 재고 몇 개야?", "도메인 밖"],
  ["내일 날씨 어때?", "무관"],
  ["김치찌개 레시피 알려줘", "무관"],
];

const chunks = JSON.parse(await readFile(new URL("../data/chunks.json", import.meta.url), "utf8"));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const norm = (v) => Math.sqrt(dot(v, v));
const normalize = (v) => { const n = norm(v); return v.map((x) => x / n); };

// --- B. 모델 카드 방식 준비 ---
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await AutoModel.from_pretrained(MODEL, { dtype: DTYPE });
const rawNorms = [];
async function cardEmbed(text) {
  const inputs = await tokenizer([text], { padding: true });
  const { sentence_embedding } = await model(inputs);
  const vector = Array.from(sentence_embedding.data);
  rawNorms.push(norm(vector)); // 모델이 내놓은 그대로의 길이(정규화 여부 확인용)
  return normalize(vector);
}

// --- 문서 벡터를 두 방식으로 계산 ---
const docsA = [], docsB = [];
for (const chunk of chunks) {
  docsA.push(await embedDocument(chunk));
  docsB.push(await cardEmbed(formatDocument(chunk)));
}

function rank(queryVector, docVectors) {
  return docVectors
    .map((v, i) => ({ id: chunks[i].id, section: chunks[i].section, score: dot(queryVector, v) }))
    .sort((x, y) => y.score - x.score);
}

const rows = [];
for (const [question, type] of QUESTIONS) {
  const rA = rank(await embedQuery(question), docsA);
  const rB = rank(await cardEmbed(formatQuery(question)), docsB);
  rows.push({ question, type, A: rA.slice(0, 3), B: rB.slice(0, 3) });
}

// --- 출력 ---
const fmt = (h) => `${h.id} ${h.score.toFixed(3)} (${h.section})`;
console.log(`\n모델 카드 방식 sentence_embedding 원래 길이: 최소 ${Math.min(...rawNorms).toFixed(4)} / 최대 ${Math.max(...rawNorms).toFixed(4)}`);
console.log("\n| # | 질문 | 유형 | A 가이드 1위 | B 카드 1위 | 1위 같음 | A 2위 | B 2위 |");
console.log("|---|---|---|---|---|---|---|---|");
rows.forEach((r, i) => {
  const same = r.A[0].id === r.B[0].id ? "예" : "**아니오**";
  console.log(`| ${i + 1} | ${r.question} | ${r.type} | ${fmt(r.A[0])} | ${fmt(r.B[0])} | ${same} | ${fmt(r.A[1])} | ${fmt(r.B[1])} |`);
});

// 관련 질문(정상·다른 표현·경계) 최저점과 무관 질문 최고점의 간격: 넓을수록 "약한 근거" 기준으로 가르기 쉽다
for (const key of ["A", "B"]) {
  const related = rows.filter((r) => ["정상", "다른 표현", "경계"].includes(r.type)).map((r) => r[key][0].score);
  const unrelated = rows.filter((r) => r.type === "무관").map((r) => r[key][0].score);
  const outOfDomain = rows.filter((r) => r.type === "도메인 밖").map((r) => r[key][0].score);
  console.log(`${key}: 관련 1위 ${Math.min(...related).toFixed(3)}~${Math.max(...related).toFixed(3)} · 도메인 밖 ${outOfDomain[0].toFixed(3)} · 무관 ${Math.min(...unrelated).toFixed(3)}~${Math.max(...unrelated).toFixed(3)} · 간격(관련 최저 − 무관 최고) ${(Math.min(...related) - Math.max(...unrelated)).toFixed(3)}`);
}

await mkdir(new URL("./결과/", import.meta.url), { recursive: true });
const outPath = new URL("./결과/임베딩_방식_비교.json", import.meta.url);
await writeFile(outPath, JSON.stringify({ model: MODEL, dtype: DTYPE, runAt: new Date().toISOString(), rows }, null, 2));
console.log("\n저장: 실험/결과/임베딩_방식_비교.json");
