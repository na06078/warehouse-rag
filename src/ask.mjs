// [2단계] 검색 + 프롬프트 조립 (+ STEP 7에서 LLM 답변 추가 예정)
// 실행: node src/ask.mjs "질문" --show-prompt [--k 3]
import { search, DEFAULT_K } from "./search.mjs";
import { buildMessages } from "./prompt.mjs";

function parseArgs(argv) {
  const options = { question: null, k: DEFAULT_K, showPrompt: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--show-prompt") options.showPrompt = true;
    else if (arg === "--k") {
      options.k = Number(argv[++i]);
      if (!Number.isInteger(options.k) || options.k < 1) throw new Error("--k 뒤에는 1 이상의 정수를 넣으세요.");
    } else if (options.question === null) options.question = arg;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return options;
}

async function main() {
  const { question, k, showPrompt } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.log('사용법: node src/ask.mjs "질문" --show-prompt [--k 3]');
    process.exit(1);
  }
  const hits = await search(question, k);
  const messages = buildMessages(question, hits);

  if (showPrompt) {
    for (const message of messages) {
      console.log(`\n[${message.role}]\n${message.content}`);
    }
    return;
  }
  console.log("LLM 답변은 STEP 7에서 추가합니다. 지금은 --show-prompt로 실행하세요.");
}

main().catch((error) => {
  console.error(`오류: ${error.message}`);
  process.exit(1);
});
