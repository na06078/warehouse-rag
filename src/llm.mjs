// llama.cpp llama-server와 주고받는 일만 담당한다. (가이드의 ollama.mjs 자리)
// llama-server는 OpenAI 호환 API를 제공한다: GET /health, GET /v1/models, POST /v1/chat/completions
// 스트리밍 응답은 SSE(Server-Sent Events) 형식: "data: {JSON}" 줄이 빈 줄로 구분되어 오고, 끝은 "data: [DONE]".
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "http://127.0.0.1:8080";
const CONNECT_TIMEOUT_MS = 3000;

// 서버가 켜져 있고 모델 로딩이 끝났는지 확인. 로딩 중이면 /health가 503을 돌려준다.
export async function pingLlm() {
  try {
    const response = await fetch(`${LLM_BASE_URL}/health`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

// 서버에 올라간 모델 이름을 읽는다(코드에 모델 이름을 고정하지 않기 위해).
// /v1/models의 id는 서버 실행 시 붙인 별칭(--alias)일 수 있어 실제 모델과 다를 수 있다.
// 그래서 실제 파일 경로를 알려 주는 /props의 model_path를 먼저 쓰고, 없으면 /v1/models로 대신한다.
export async function getModelName() {
  try {
    const props = await (await fetch(`${LLM_BASE_URL}/props`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) })).json();
    if (props?.model_path) return props.model_path.split(/[\\/]/).pop();
  } catch {
    // /props가 없는 서버면 아래로 넘어간다
  }
  try {
    const response = await fetch(`${LLM_BASE_URL}/v1/models`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    const body = await response.json();
    return body?.data?.[0]?.id ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 메시지를 보내고 답변을 조각(토큰)마다 onToken으로 넘긴다.
 * @returns {{ text: string, reasoningChars: number, usage: object|null, timings: object|null }}
 *   reasoningChars: 생각(추론) 내용 글자 수. 생각 모드를 껐다면 0이어야 한다(검증용).
 */
export async function chatStream(messages, onToken) {
  const response = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0, // 같은 질문에는 같은 답 → 설정을 바꿨을 때 차이를 비교할 수 있게
      chat_template_kwargs: { enable_thinking: false }, // 생각 모드를 요청마다 끈다 (Ollama의 think:false)
      stream_options: { include_usage: true },
    }),
  });
  if (!response.ok) {
    throw new Error(`llama-server 오류 HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  // stream:true 디코더: 한글 한 글자(3바이트)가 네트워크 조각 경계에서 잘려도 깨지지 않게 다음 조각과 이어 붙인다.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let text = "";
  let reasoningChars = 0;
  let usage = null;
  let timings = null;

  const handleLine = (line) => {
    if (!line.startsWith("data:")) return; // 빈 줄·주석 줄은 무시
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    const event = JSON.parse(data);
    const delta = event.choices?.[0]?.delta ?? {};
    if (delta.reasoning_content) reasoningChars += delta.reasoning_content.length;
    if (delta.content) {
      text += delta.content;
      onToken(delta.content);
    }
    if (event.usage) usage = event.usage;
    if (event.timings) timings = event.timings;
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // 아직 덜 받은 마지막 줄은 다음 조각과 합친다
    for (const line of lines) handleLine(line.trim());
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer.trim());

  return { text, reasoningChars, usage, timings };
}
