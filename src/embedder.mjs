// 임베딩 공통 모듈: 문서와 질문을 "같은 모델·같은 설정"으로 벡터로 바꾸는 유일한 곳.
// 문서용과 질문용 설정이 서로 어긋나면 오류 없이 검색 점수만 나빠지므로, 설정은 여기에만 둔다.
import { pipeline } from "@huggingface/transformers";

export const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
export const DTYPE = "q8";
export const DIM = 768;

// EmbeddingGemma 모델 카드의 공식 접두어
const DOCUMENT_PREFIX = (section) => `title: ${section} | text: `;
const QUERY_PREFIX = "task: search result | query: ";

let extractorPromise = null;

// 파이프라인은 처음 한 번만 만들고 재사용한다(모델 로딩이 가장 오래 걸리기 때문).
function getExtractor() {
  if (!extractorPromise) {
    console.log("임베딩 모델 불러오는 중…(첫 실행은 다운로드)");
    extractorPromise = pipeline("feature-extraction", MODEL, { dtype: DTYPE });
  }
  return extractorPromise;
}

async function embed(input) {
  const extractor = await getExtractor();
  // mean pooling(토큰 벡터 평균) + 정규화(길이 1) → 내적 = 코사인 유사도
  const output = await extractor(input, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  if (vector.length !== DIM) {
    throw new Error(`임베딩 차원이 ${DIM}이 아닙니다: ${vector.length}`);
  }
  return vector;
}

export function embedDocument(chunk) {
  return embed(DOCUMENT_PREFIX(chunk.section) + chunk.text);
}

export function embedQuery(question) {
  return embed(QUERY_PREFIX + question);
}

// 실험 스크립트가 같은 접두어를 쓰도록 공개한다(정식 검색 경로에는 영향 없음).
export function formatDocument(chunk) {
  return DOCUMENT_PREFIX(chunk.section) + chunk.text;
}
export function formatQuery(question) {
  return QUERY_PREFIX + question;
}
