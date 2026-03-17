const COUNTRY_HINTS = [
  [/美国|美版|us版/i, 'us'], [/英国/i, 'uk'], [/日本|日版/i, 'jp'],
  [/韩国|韩版/i, 'kr'], [/法国/i, 'fr'], [/德国/i, 'de'],
  [/中国|国内|大陆/i, 'cn'], [/台湾/i, 'tw'], [/香港/i, 'hk'],
];

const LANG_HINTS = [
  [/英文资料|in english|english\s+(?:source|result|article)/i, 'en'],
  [/中文搜|用中文/i, 'zh-cn'],
  [/日文|日语/i, 'ja'],
  [/韩文|韩语/i, 'ko'],
];

export function detectSearchLocale(query) {
  let gl = null;
  let hl = null;
  for (const [re, code] of COUNTRY_HINTS) {
    if (re.test(query)) { gl = code; break; }
  }
  for (const [re, code] of LANG_HINTS) {
    if (re.test(query)) { hl = code; break; }
  }
  if (!gl && !hl) {
    const hasChinese = /[\u4e00-\u9fff]/.test(query);
    if (hasChinese) { hl = 'zh-cn'; gl = 'cn'; }
    else { hl = 'en'; gl = 'us'; }
  }
  return { gl: gl || (hl === 'zh-cn' ? 'cn' : 'us'), hl: hl || 'en' };
}

export async function searchWeb(query, apiKey) {
  if (!apiKey) throw new Error('SERPER_API_KEY is not configured');
  const { gl, hl } = detectSearchLocale(query);
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 5, gl, hl }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Serper API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const parts = [];
  if (data.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    const desc = (kg.description || '').slice(0, 200);
    parts.push(`[${kg.title}] ${desc}`);
  }
  if (data.organic) {
    for (const r of data.organic.slice(0, 5)) {
      const snippet = (r.snippet || '').slice(0, 200);
      parts.push(`[${r.title}](${r.link})\n${snippet}`);
    }
  }
  let result = parts.join('\n\n') || 'No results found.';
  if (result.length > 3000) result = result.slice(0, 3000) + '\n[truncated]';
  return result;
}
