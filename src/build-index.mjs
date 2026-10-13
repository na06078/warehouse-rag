// 청크(data/chunks.json) → 벡터 저장소(data/vectors.json)
// 실행: node src/build-index.mjs
import { readFile, writeFile } from "node:fs/promises";
import { embedDocument, MODEL, DTYPE, DIM } from "./embedder.mjs";

const CHUNKS_PATH = new URL("../data/chunks.json", import.meta.url);
const VECTORS_PATH = new URL("../data/vectors.json", import.meta.url);
const REQUIRED_FIELDS = ["id", "text", "url", "section"];
const MIN_TEXT_LENGTH = 120;

function validateChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("data/chunks.json이 비어 있거나 배열이 아닙니다.");
  }
  const seen = new Set();
  for (const [index, chunk] of chunks.entries()) {
    const missing = REQUIRED_FIELDS.filter((field) => !chunk[field]);
    if (missing.length > 0) {
      throw new Error(`${index + 1}번째 청크(${chunk.id ?? "id 없음"})에 필드가 없습니다: ${missing.join(", ")}`);
    }
    if (seen.has(chunk.id)) throw new Error(`중복 id: ${chunk.id}`);
    seen.add(chunk.id);
    if (chunk.text.length < MIN_TEXT_LENGTH) {
      console.warn(`⚠ ${chunk.id}: text가 ${chunk.text.length}자로 ${MIN_TEXT_LENGTH}자 미만입니다.`);
    }
  }
}

const norm = (vector) => Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));

async function main() {
  const chunks = JSON.parse(await readFile(CHUNKS_PATH, "utf8"));
  validateChunks(chunks);

  const stored = [];
  for (const chunk of chunks) {
    const vector = await embedDocument(chunk);
    stored.push({ ...chunk, vector });
    console.log(`✓ ${chunk.id} (${chunk.section})`);
  }

  const wrong = stored.filter((c) => c.vector.length !== DIM);
  if (wrong.length > 0) {
    throw new Error(`${DIM}차원이 아닌 벡터: ${wrong.map((c) => c.id).join(", ")}`);
  }

  const store = { model: MODEL, dtype: DTYPE, dim: DIM, createdAt: new Date().toISOString(), chunks: stored };
  await writeFile(VECTORS_PATH, JSON.stringify(store));

  // 학습용 출력: 벡터가 실제로 어떻게 생겼는지, 길이가 1로 정규화됐는지
  const first = stored[0].vector;
  const head = first.slice(0, 5).map((x) => x.toFixed(4)).join(", ");
  console.log(`첫 벡터 앞 5개: [${head}]  노름: ${norm(first).toFixed(4)}`);
  console.log(`저장: data/vectors.json — ${stored.length}청크 × ${DIM}차원`);
}

main().catch((error) => {
  console.error(`오류: ${error.message}`);
  process.exit(1);
});
