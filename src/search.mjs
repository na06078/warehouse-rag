// [1단계 완성품] 질문 → 비슷한 청크 top-k를 점수와 함께 보여 준다.
// 실행: node src/search.mjs "질문1" ["질문2" …] [--k 3]
// 다른 파일(ask.mjs)은 search()와 WEAK_THRESHOLD를 import해서 쓴다.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { embedQuery, MODEL, DTYPE } from "./embedder.mjs";

// 1위 점수가 이보다 낮으면 "관련 자료가 약함". 이 값은 이 파일에서만 정의한다.
// 근거: STEP 3 실측(가이드 방식) 관련 질문 1위 0.663 이상, 무관 질문 0.449 이하.
export const WEAK_THRESHOLD = 0.55;
export const DEFAULT_K = 3;

const VECTORS_PATH = new URL("../data/vectors.json", import.meta.url);
let storePromise = null;

async function loadStore() {
  if (!storePromise) {
    storePromise = readFile(VECTORS_PATH, "utf8")
      .catch(() => {
        throw new Error("data/vectors.json이 없습니다. 먼저 node src/build-index.mjs 를 실행하세요.");
      })
      .then((raw) => {
        const store = JSON.parse(raw);
        // 다른 모델·설정으로 만든 벡터와 비교하면 숫자는 나와도 의미가 없으므로 거부한다.
        if (store.model !== MODEL || store.dtype !== DTYPE) {
          throw new Error(
            `벡터 저장소(${store.model}, ${store.dtype})가 현재 임베딩 설정(${MODEL}, ${DTYPE})과 다릅니다. ` +
              "node src/build-index.mjs 를 다시 실행하세요."
          );
        }
        return store;
      });
  }
  return storePromise;
}

// 벡터가 정규화되어 있으므로 내적 = 코사인 유사도
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

export async function search(question, k = DEFAULT_K) {
  const store = await loadStore();
  const queryVector = await embedQuery(question);
  return store.chunks
    .map(({ vector, ...chunk }) => ({ ...chunk, score: dot(queryVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ----- CLI -----
function parseArgs(argv) {
  const questions = [];
  let k = DEFAULT_K;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--k") {
      k = Number(argv[++i]);
      if (!Number.isInteger(k) || k < 1) throw new Error("--k 뒤에는 1 이상의 정수를 넣으세요.");
    } else {
      questions.push(argv[i]);
    }
  }
  return { questions, k };
}

const bar = (score) => {
  const filled = Math.max(0, Math.min(20, Math.round(score * 20)));
  return "█".repeat(filled) + "░".repeat(20 - filled);
};

async function main() {
  const { questions, k } = parseArgs(process.argv.slice(2));
  if (questions.length === 0) {
    console.log('사용법: node src/search.mjs "질문1" ["질문2" …] [--k 3]');
    process.exit(1);
  }
  for (const question of questions) {
    const hits = await search(question, k);
    const weak = hits[0].score < WEAK_THRESHOLD ? `  ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})` : "";
    console.log(`\nQ: ${question}${weak}`);
    hits.forEach((hit, index) => {
      console.log(`  ${index + 1}. ${hit.id}  ${hit.score.toFixed(3)}  ${bar(hit.score)}  [${hit.section}]`);
      console.log(`     ${hit.text.slice(0, 60)}…`);
      console.log(`     출처: ${hit.url}`);
    });
  }
}

// 직접 실행했을 때만 CLI를 돈다(ask.mjs가 import할 때는 실행되지 않음).
// process.argv[1]이 없는 경우(node -e 등)도 있으므로 먼저 확인한다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`오류: ${error.message}`);
    process.exit(1);
  });
}
