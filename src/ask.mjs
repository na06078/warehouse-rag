// [2단계 완성품] 검색 → 프롬프트 조립 → LLM 답변(스트리밍) → 근거 목록
// 실행: node src/ask.mjs "질문" [--k 3] [--show-prompt] [--no-rag]
import { search, DEFAULT_K, WEAK_THRESHOLD } from "./search.mjs";
import { buildMessages, isWeak } from "./prompt.mjs";
import { pingLlm, getModelName, chatStream, LLM_BASE_URL } from "./llm.mjs";

function parseArgs(argv) {
  const options = { question: null, k: DEFAULT_K, showPrompt: false, noRag: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--show-prompt") options.showPrompt = true;
    else if (arg === "--no-rag") options.noRag = true;
    else if (arg === "--k") {
      options.k = Number(argv[++i]);
      if (!Number.isInteger(options.k) || options.k < 1) throw new Error("--k 뒤에는 1 이상의 정수를 넣으세요.");
    } else if (options.question === null) options.question = arg;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return options;
}

const seconds = (ms) => (ms / 1000).toFixed(1);

// LLM을 실제로 부르기 직전에만 연결을 확인한다(--show-prompt는 서버 없이 동작).
async function ensureLlm() {
  if (!(await pingLlm())) {
    console.error(
      `llama-server가 실행 중인지 확인하세요 (확인: curl.exe ${LLM_BASE_URL}/health). ` +
        "서버를 막 켰다면 모델 로딩이 끝날 때까지 기다린 뒤 다시 실행하세요."
    );
    process.exit(1);
  }
  return getModelName();
}

async function answer(messages) {
  const started = Date.now();
  const result = await chatStream(messages, (token) => process.stdout.write(token));
  process.stdout.write("\n");
  return { ...result, ms: Date.now() - started };
}

// 생각 내용 글자 수를 함께 보여 줘, 생각 모드가 정말 꺼졌는지(0자) 매번 확인할 수 있게 한다.
function printLlmFooter(model, result) {
  const parts = [`모델 ${model}`];
  if (result.usage) parts.push(`입력 ${result.usage.prompt_tokens}토큰 · 출력 ${result.usage.completion_tokens}토큰`);
  parts.push(`생각 내용 ${result.reasoningChars}자`);
  console.log(`🧠 ${parts.join(" · ")}`);
}

async function main() {
  const { question, k, showPrompt, noRag } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.log('사용법: node src/ask.mjs "질문" [--k 3] [--show-prompt] [--no-rag]');
    process.exit(1);
  }

  // --no-rag: 검색도 시스템 메시지도 없이 질문만 보낸다(RAG 효과 비교 실험용).
  if (noRag) {
    const model = await ensureLlm();
    console.log("💬 답변 (RAG 없음)");
    const result = await answer([{ role: "user", content: question }]);
    printLlmFooter(model, result);
    console.log(`⏱ 답변 ${seconds(result.ms)}초`);
    return;
  }

  const searchStarted = Date.now();
  const hits = await search(question, k);
  const searchMs = Date.now() - searchStarted;
  const messages = buildMessages(question, hits);

  if (showPrompt) {
    for (const message of messages) console.log(`\n[${message.role}]\n${message.content}`);
    return;
  }

  const model = await ensureLlm();
  const weak = isWeak(hits);

  console.log(`🔎 검색 결과${weak ? `  ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})` : ""}`);
  for (const hit of hits) console.log(`  ${hit.id}  ${hit.score.toFixed(3)}  ${hit.section}`);

  console.log("💬 답변");
  const result = await answer(messages);

  // 근거 목록은 LLM에 맡기지 않고 프로그램이 만든다. 답변에 ID 글자가 있으면 ✓(괄호 모양과 무관).
  console.log("📚 근거 (LLM에게 넘긴 자료 · ✓ = 답변에 ID가 표시된 자료)");
  let anyCited = false;
  for (const hit of hits) {
    const cited = result.text.includes(hit.id);
    anyCited ||= cited;
    console.log(`  ${cited ? "✓" : " "} ${hit.id}  ${hit.section}  ${hit.url}`);
  }
  if (weak) console.log("  ⚠ 관련 자료가 약해 이 자료들을 답변의 근거로 보기 어렵습니다");
  else if (!anyCited) console.log("  (답변에 ID 표시가 없습니다. 위 자료와 답변을 비교해 확인하세요)");

  printLlmFooter(model, result);
  console.log(`⏱ 검색 ${seconds(searchMs)}초 · 답변 ${seconds(result.ms)}초`);
}

main().catch((error) => {
  console.error(`오류: ${error.message}`);
  process.exit(1);
});
