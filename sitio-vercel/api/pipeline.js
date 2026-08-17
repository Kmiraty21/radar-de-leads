// Funcion serverless: guarda/lee el status de pipeline por dominio en Vercel KV
// (Upstash Redis via su REST API, sin dependencias npm).
// Requiere las variables de entorno KV_REST_API_URL y KV_REST_API_TOKEN, que Vercel
// inyecta solas cuando conectas una base de datos KV al proyecto (Storage > Create Database).

const KEY = 'radar_pipeline_status';
const OPCIONES_VALIDAS = ['Lead', 'Reunión', 'Negociando', 'Ganado', 'Perdido'];

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
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    res.status(500).json({ error: 'Vercel KV no esta configurado (faltan KV_REST_API_URL / KV_REST_API_TOKEN). Ve a Storage > Create Database en el proyecto de Vercel.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const raw = await comandoKV(url, token, ['GET', KEY]);
      res.status(200).json(raw ? JSON.parse(raw) : {});
      return;
    }

    if (req.method === 'POST') {
      const { dominio, estado } = req.body || {};
      if (!dominio || !estado) { res.status(400).json({ error: 'Faltan dominio o estado.' }); return; }
      if (!OPCIONES_VALIDAS.includes(estado)) { res.status(400).json({ error: 'Estado no valido.' }); return; }

      const raw = await comandoKV(url, token, ['GET', KEY]);
      const mapa = raw ? JSON.parse(raw) : {};
      mapa[dominio] = estado;
      await comandoKV(url, token, ['SET', KEY, JSON.stringify(mapa)]);
      res.status(200).json({ ok: true, mapa });
      return;
    }

    res.status(405).json({ error: 'Metodo no soportado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
