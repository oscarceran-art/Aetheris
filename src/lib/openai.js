const URL_BASE = "https://api.openai.com/v1";

// The o-series and gpt-5/gpt-6 are reasoning models: they reject any temperature
// other than the default (1), so we simply never send one for them.
const ignoresTemperature = (m = "") => /^(o\d|gpt-5|gpt-6)/.test(m);

// ...and on /v1/chat/completions they refuse function tools while reasoning is
// on, so tool rounds ask for reasoning_effort: "none".
const toolsNeedNoReasoning = (m = "") => /^gpt-6/.test(m);

async function readError(res) {
  try {
    const j = await res.json();
    return j.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function post(apiKey, body, signal) {
  return fetch(`${URL_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
}

export async function streamChat({ apiKey, model, messages, temperature, onToken, signal }) {
  if (!apiKey) throw new Error("Add your OpenAI API key in Settings first.");
  const body = { model, messages, stream: true };
  if (!ignoresTemperature(model) && temperature != null) body.temperature = temperature;
  let res = await post(apiKey, body, signal);
  if (!res.ok) {
    const msg = await readError(res);
    // Some orgs can't stream certain models; fall back to a single response
    if (res.status === 400 && /stream/i.test(msg)) {
      res = await post(apiKey, { ...body, stream: false }, signal);
      if (!res.ok) throw new Error(await readError(res));
      const text = (await res.json()).choices?.[0]?.message?.content || "";
      onToken?.(text);
      return text;
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken?.(full);
        }
      } catch {}
    }
  }
  return full;
}

// Non-streaming completion used for tool-calling rounds: returns the raw
// assistant message so the caller can look for tool_calls.
export async function completeChat({ apiKey, model, messages, temperature, tools, signal }) {
  if (!apiKey) throw new Error("Add your OpenAI API key in Settings first.");
  const body = { model, messages };
  if (tools?.length) {
    body.tools = tools;
    if (toolsNeedNoReasoning(model)) body.reasoning_effort = "none";
  }
  if (!ignoresTemperature(model) && temperature != null) body.temperature = temperature;
  const res = await post(apiKey, body, signal);
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return json.choices?.[0]?.message || {};
}

export async function listModels(apiKey) {
  const res = await fetch(`${URL_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(await readError(res));
  const { data } = await res.json();
  return data
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|instruct)/.test(id))
    .sort();
}
