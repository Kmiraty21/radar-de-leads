// Lee los leads que se agregaron desde el boton "Buscar candidatos nuevos" del
// admin (guardados por api/scouting.js). Lectura publica, sin PIN — es la misma
// idea que leer leads.json, solo que estos no viven en el repo todavia.

const KEY = 'radar_leads_extra';

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
  if (!url || !token) { res.status(200).json([]); return; } // sin KV configurado, simplemente no hay extras todavia

  try {
    if (req.method === 'DELETE') {
      const adminKey = process.env.ADMIN_SCOUTING_KEY;
      if (!adminKey || req.headers['x-admin-key'] !== adminKey) { res.status(401).json({ error: 'PIN incorrecto.' }); return; }
      await comandoKV(url, token, ['DEL', KEY]);
      res.status(200).json({ ok: true });
      return;
    }

    const raw = await comandoKV(url, token, ['GET', KEY]);
    res.status(200).json(raw ? JSON.parse(raw) : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
