/** Bound the downloaded body while streaming, before buffering an external file. */
export async function publicText(
  url: URL,
  fetcher: typeof fetch,
  signal: AbortSignal,
  maxBytes: number,
) {
  const response = await fetcher(url, {
    signal,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("Fonte indisponível");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error("Resposta demasiado grande");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
