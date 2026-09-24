// Dispara una busqueda real de candidatos (API de pago de Anthropic) desde el
// boton "Buscar candidatos nuevos" en la vista admin del sitio. Protegido con un
// PIN (ADMIN_SCOUTING_KEY) para que no cualquiera que visite el link admin pueda
// gastar la cuenta de Anthropic del usuario.
//
// Variables de entorno requeridas en Vercel (Project Settings > Environment Variables):
//   ANTHROPIC_API_KEY   - la key de pago (la misma que se usa por CLI)
//   ADMIN_SCOUTING_KEY  - un PIN que solo Koresma conoce, para poder usar el boton
// Opcionales:
//   SEMRUSH_MCP_TOKEN, EXPLORIUM_MCP_TOKEN

const { construirPrompt, extraerPrimerArrayJSON, construirLead, llamarClaudeConContinuacion } = require('../scouting/buscar-candidatos.js');

const KEY = 'radar_leads_extra';
const AGENCIAS = ['We Love Carts', 'Noos Consulting', 'Trest me', 'Reevolution', 'Cocktail Marketing'];

async function comandoKV(url, token, cmd) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo no soportado.' }); return; }

  const adminKey = process.env.ADMIN_SCOUTING_KEY;
  if (!adminKey) { res.status(500).json({ error: 'ADMIN_SCOUTING_KEY no esta configurado en Vercel.' }); return; }
  if (req.headers['x-admin-key'] !== adminKey) { res.status(401).json({ error: 'PIN incorrecto.' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY no esta configurado en Vercel.' }); return; }

  const semillas = (req.body || {}).semillas;
  if (!Array.isArray(semillas) || semillas.length === 0 || semillas.length > 5) {
    res.status(400).json({ error: 'Manda entre 1 y 5 dominios semilla.' });
    return;
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) { res.status(500).json({ error: 'Vercel KV no esta configurado.' }); return; }

  try {
    const prompt = construirPrompt(semillas);
    const data = await llamarClaudeConContinuacion(prompt, apiKey, {
      semrushToken: process.env.SEMRUSH_MCP_TOKEN || null,
      exploriumToken: process.env.EXPLORIUM_MCP_TOKEN || null
    });

    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const texto = textBlocks.length ? textBlocks[textBlocks.length - 1].text : '';
    const jsonStr = extraerPrimerArrayJSON(texto);
    if (!jsonStr) { res.status(502).json({ error: 'Claude no devolvio un array JSON reconocible.' }); return; }

    const crudos = JSON.parse(jsonStr);
    const raw = await comandoKV(kvUrl, kvToken, ['GET', KEY]);
    const existentes = raw ? JSON.parse(raw) : [];
    const dominiosExistentes = new Set(existentes.map(l => l.dominio));

    let agregados = 0, descartados = 0;
    const fecha = new Date().toISOString().split('T')[0];
    let indiceAgencia = existentes.length;

    for (const n of crudos) {
      const resultado = construirLead(n);
      if (!resultado) continue;
      if (resultado.descartado) { descartados++; continue; }
      if (dominiosExistentes.has(resultado.lead.dominio)) continue;

      resultado.lead.estado = 'Asignado';
      resultado.lead.agencia_asignada = AGENCIAS[indiceAgencia % 5];
      resultado.lead.fecha_asignacion = fecha;
      indiceAgencia++;

      existentes.push(resultado.lead);
      dominiosExistentes.add(resultado.lead.dominio);
      agregados++;
    }

    await comandoKV(kvUrl, kvToken, ['SET', KEY, JSON.stringify(existentes)]);
    res.status(200).json({ ok: true, agregados, descartados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
