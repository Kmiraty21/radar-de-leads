#!/usr/bin/env node
// Replica "Buscar candidatos" de app.html pero contra la API real de Anthropic
// (con API key de pago), para no depender de pegar un JSON exportado del artifact.
// Mismo prompt, mismo parser de JSON, mismas reglas de filtrado — copiados literal
// de app.html (rlBuscarCandidatos / extraerPrimerArrayJSON) porque este script ya
// vive en el mismo stack (Node.js plano, sin dependencias npm, como api/pipeline.js).
//
// Uso:
//   ANTHROPIC_API_KEY=sk-ant-... node scouting/buscar-candidatos.js dominio1.mx dominio2.mx dominio3.mx
//   node scouting/buscar-candidatos.js dominio1.mx dominio2.mx --output sitio-vercel/radar-leads-resultado.json
//
// Variables de entorno opcionales (si no estan, se omiten esos 2 conectores MCP y
// el script cae a busqueda web normal, igual que hace el artifact cuando Semrush
// no tiene datos para un dominio):
//   SEMRUSH_MCP_TOKEN
//   EXPLORIUM_MCP_TOKEN
//
// Enriquecimiento de contacto opcional (mejora un contacto generico a uno con
// nombre real, via Lusha — plan gratis incluye 40 creditos/mes con API):
//   LUSHA_API_KEY

const fs = require('fs');
const path = require('path');

function parsearArgs(argv) {
  const semillas = [];
  let output = path.join(__dirname, '..', 'sitio-vercel', 'radar-leads-resultado.json');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--output' || argv[i] === '-o') { output = argv[++i]; continue; }
    semillas.push(argv[i]);
  }
  return { semillas, output };
}

// ============================================================
// Prompt exacto de rlBuscarCandidatos en app.html (no reescribir).
// ============================================================
function construirPrompt(semillas) {
  return 'Eres un investigador de mercado de e-commerce en Mexico. Para cada uno de estos dominios semilla: '
    + semillas.join(', ')
    + ', busca en la web informacion para identificar hasta 3 negocios mexicanos del mismo giro/categoria que parezcan operar a buena escala. No repitas los mismos dominios semilla como resultado.\n\n'
    + 'CRITICO sobre el dominio: el campo "dominio" que reportes DEBE ser exactamente la URL real que confirmaste en tus resultados de busqueda (la que aparece tal cual en el resultado o la que visitaste), nunca un dominio que tu construyas o adivines a partir del nombre de la marca (ej. nunca asumas que "Marca X" tiene el dominio "marcax.com" sin haberlo visto confirmado en un resultado real). Si encontraste la marca pero no su dominio exacto y confirmado, descarta ese candidato y busca otro en su lugar — es mejor un candidato menos que un link roto.\n\n'
    + 'Para cada negocio candidato que encuentres, investiga a fondo (varias busquedas si hace falta, no te rindas en el primer intento):\n'
    + '1. TRAFICO — tienes acceso a herramientas de Semrush, usalas primero para obtener el dato real de visitas mensuales y % de trafico pagado de cada dominio candidato (es un dato mucho mas confiable que buscarlo en la web). Si Semrush no tiene datos para un dominio especifico (comun en sitios muy nuevos o pequenos), como respaldo intenta una busqueda web de SimilarWeb para ese dominio puntual.\n'
    + '1b. FACTURACION — OBLIGATORIO, sin excepcion: da tu mejor estimado de facturacion mensual en MXN para este negocio, usando cualquier senal disponible. Si tienes visitas de SimilarWeb, usa esa base (visitas x 2% conversion x ticket promedio tipico de la categoria). Si NO tienes visitas, usa otras senales para llegar a un numero razonable: numero de sucursales fisicas, tamano de catalogo, seguidores en redes y su nivel de engagement, menciones de volumen en prensa, anos operando, inversion evidente en ads. NUNCA dejes este campo vacio ni en 0 — siempre entrega un numero entero, aunque sea una estimacion amplia; si es muy incierta, dilo en la nota de calificacion, pero el numero debe existir.\n'
    + '2. ADS — reporta los 3 canales, pero se eficiente: 1 busqueda por canal es suficiente (ej: "[marca] site:facebook.com/ads/library"), no repitas variantes si la primera no encuentra nada. (a) Meta Ad Library (facebook.com/ads/library), (b) TikTok Creative Center, (c) Google Ads Transparency Center (adstransparency.google.com). Para cada canal donde encuentres presencia activa, anota el canal y, si es posible, el link directo.\n'
    + '3. Plataforma de ecommerce: Shopify, VTEX, WooCommerce, Magento, Tiendanube, u otra (di cual). Si NO encuentras evidencia de ninguna de estas, distingue entre 2 casos: si el dominio SI tiene un sitio web real (aunque sea informativo/catalogo, con contenido, pixeles de tracking, etc.) pero sin plataforma de ecommerce reconocida, usa "Sitio propio sin ecommerce reconocido"; si de verdad NO hay sitio web (solo redes sociales/perfil de Instagram), usa "Sin sitio — solo RRSS". No confundas estos 2 casos.\n'
    + '4. CONTACTO — el objetivo PRINCIPAL es encontrar una persona con nombre real (fundador/dueno/CEO/director general/gerente de marketing o ecommerce), no solo el correo generico de la marca. Sigue este orden, y no te conformes con el generico hasta agotar las 3 tecnicas siguientes:\n'
    + '   a) Busca en LinkedIn con operador site: (ej: site:linkedin.com/in "[marca]" (fundador OR founder OR CEO OR "director general" OR dueno OR gerente)) — esto suele dar nombre, cargo y el link de LinkedIn en un solo intento.\n'
    + '   b) Si no aparece, busca notas de prensa o entrevistas (ej: "[marca]" (fundador OR "director general" OR CEO OR entrevista)) — medios locales frecuentemente nombran al dueno o director.\n'
    + '   c) Si tampoco, revisa la pagina "Quienes somos" / "Nuestro equipo" / "Contacto" del sitio (busca "[marca]" (quienes somos OR nuestro equipo OR "sobre nosotros")) — muchos sitios pequenos listan al fundador ahi.\n'
    + '   Si con esas 3 tecnicas no aparece ningun nombre, entonces si intenta 1-2 busquedas mas para al menos el dato general (ej: "[marca] whatsapp OR contacto OR telefono"). Se eficiente: DETENTE en cuanto una tecnica te de un resultado usable, no sigas con las siguientes. Si con todo esto (5-6 intentos totales por candidato) no aparece nada, deja los campos vacios y sigue con el siguiente candidato — no insistas mas.\n'
    + '   Reporta lo que encuentres en: contacto_nombre, contacto_cargo, contacto_telefono (prioriza WhatsApp si se indica como tal), contacto_correo, contacto_linkedin. IMPORTANTE: un nombre solo, SIN telefono, correo o LinkedIn, NO es un dato de contacto util — este candidato terminaria descartado igual, asi que si solo encuentras un nombre sin ninguna forma real de contactarlo, sigue buscando telefono/correo/linkedin antes de dejarlo asi; un telefono o correo GENERAL de la marca (sin nombre de persona) es un ultimo recurso valido, pero SIEMPRE preferible un nombre real con su propio dato de contacto. Regla innegociable: nunca inventes un dato que no viste confirmado en un resultado real; un dato falso es peor que uno vacio.\n\n'
    + 'Prioriza la velocidad: es mejor terminar la lista completa con busquedas eficientes que agotar cada dato al maximo. Usa pocas busquedas bien dirigidas por candidato en vez de muchas sueltas.\n\n'
    + 'Cuando termines de investigar TODOS los candidatos, tu ULTIMO mensaje de texto debe contener UNICAMENTE el array JSON final, sin explicar tu proceso ahi, sin encabezados, sin texto antes ni despues. Formato exacto: [{"dominio": "ejemplo.mx", "marca": "Ejemplo", "semilla_origen": "chabacano.mx", "visitas_mensuales_estimadas": "45,000", "porcentaje_trafico_pagado": "18%", "facturacion_estimada_mxn": 850000, "ads_activos": "Meta (link: facebook.com/ads/library/?id=123), TikTok: no encontrado, Google: si, sin link publico", "plataforma": "Shopify (o Sitio propio sin ecommerce reconocido, o Sin sitio — solo RRSS)", "contacto_nombre": "Juan Perez", "contacto_cargo": "CEO", "contacto_telefono": "+52 55 1234 5678", "contacto_correo": "contacto@ejemplo.mx", "contacto_linkedin": "linkedin.com/in/juanperez", "nota_calificacion": "Tiene 200k seguidores activos en Instagram y coverage en prensa especializada"}]. facturacion_estimada_mxn es OBLIGATORIO en todos los objetos, siempre un numero entero mayor a 0, nunca vacio. Los demas campos, si no hay dato pese a intentar en todas las fuentes indicadas, usa un string vacio "".';
}

// ============================================================
// Parser exacto de extraerPrimerArrayJSON en app.html (no reescribir).
// ============================================================
function extraerPrimerArrayJSON(texto) {
  const marcado = texto.match(/```json\s*([\s\S]*?)```/);
  if (marcado) {
    const candidato = marcado[1].trim();
    try { JSON.parse(candidato); return candidato; } catch (e) { /* seguir con estrategia 2 */ }
  }
  let desde = 0;
  while (true) {
    const inicio = texto.indexOf('[', desde);
    if (inicio === -1) return null;
    let profundidad = 0, dentroDeString = false, escapando = false, seCerro = false;
    for (let i = inicio; i < texto.length; i++) {
      const ch = texto[i];
      if (escapando) { escapando = false; continue; }
      if (ch === '\\') { escapando = true; continue; }
      if (ch === '"') { dentroDeString = !dentroDeString; continue; }
      if (dentroDeString) continue;
      if (ch === '[') profundidad++;
      else if (ch === ']') {
        profundidad--;
        if (profundidad === 0) {
          seCerro = true;
          const candidato = texto.substring(inicio, i + 1);
          try { JSON.parse(candidato); return candidato; }
          catch (e) { break; }
        }
      }
    }
    if (!seCerro) return null;
    desde = inicio + 1;
  }
}

async function llamarClaudeConContinuacion(prompt, apiKey, { semrushToken, exploriumToken }) {
  const tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  const mcpServers = [];
  const betas = [];

  if (semrushToken) {
    tools.push({ type: 'mcp_toolset', mcp_server_name: 'semrush' });
    mcpServers.push({ type: 'url', url: 'https://mcp.semrush.com/claude/v1/mcp', name: 'semrush', authorization_token: semrushToken });
  }
  if (exploriumToken) {
    tools.push({ type: 'mcp_toolset', mcp_server_name: 'vibeprospecting' });
    mcpServers.push({ type: 'url', url: 'https://vibeprospecting.explorium.ai/mcp', name: 'vibeprospecting', authorization_token: exploriumToken });
  }
  if (mcpServers.length > 0) betas.push('mcp-client-2025-11-20');

  let messages = [{ role: 'user', content: prompt }];
  let data = null;
  const MAX_CONTINUACIONES = 4;

  for (let intento = 0; intento <= MAX_CONTINUACIONES; intento++) {
    const body = { model: 'claude-sonnet-5', max_tokens: 8000, messages, tools };
    if (mcpServers.length > 0) body.mcp_servers = mcpServers;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    if (betas.length > 0) headers['anthropic-beta'] = betas.join(',');

    const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    data = await response.json();
    if (data.error) throw new Error('Error de la API: ' + (data.error.message || JSON.stringify(data.error)));
    console.log('intento', intento, '— stop_reason:', data.stop_reason);
    if (data.stop_reason !== 'pause_turn') break;
    messages = messages.concat([{ role: 'assistant', content: data.content }]);
  }
  return data;
}

// Titulos de quien toma decisiones, en ingles y espanol (Lusha jobTitles es texto libre)
const TITULOS_DECISION = [
  'CEO', 'Founder', 'Co-Founder', 'Owner', 'President', 'General Manager', 'Managing Director',
  'Director General', 'Fundador', 'Fundadora', 'Dueño', 'Dueña', 'Gerente General',
  'Director de Marketing', 'Marketing Director', 'Gerente de Marketing',
  'E-commerce Manager', 'Director Comercial', 'Director Ejecutivo'
];

// Busca un contacto con nombre real para un dominio via Lusha (opcional, requiere
// LUSHA_API_KEY). Solo tiene sentido llamarla cuando Claude no encontro un nombre
// (solo dato generico), para no gastar creditos de mas.
async function enriquecerContactoLusha(dominio, apiKey) {
  try {
    const busqueda = await fetch('https://api.lusha.com/v3/contacts/prospecting', {
      method: 'POST',
      headers: { 'api_key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagination: { page: 0, size: 5 },
        filters: {
          contacts: { include: { jobTitles: TITULOS_DECISION } },
          companies: { include: { domains: [dominio] } }
        },
        options: { maxContactsPerCompany: 3 }
      })
    });
    const datosBusqueda = await busqueda.json();
    if (!busqueda.ok || !Array.isArray(datosBusqueda.results) || datosBusqueda.results.length === 0) return null;
    const mejor = datosBusqueda.results[0];

    const enrich = await fetch('https://api.lusha.com/v3/contacts/enrich', {
      method: 'POST',
      headers: { 'api_key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [mejor.id], reveal: ['emails', 'phones'] })
    });
    const datosEnrich = await enrich.json();
    const c = (datosEnrich.contacts || [])[0];
    if (!c) return null;

    const cargo = typeof c.jobTitle === 'string' ? c.jobTitle : ((c.jobTitle && c.jobTitle.title) || (mejor.jobTitle && mejor.jobTitle.title) || '');
    return {
      contacto_nombre: [c.firstName, c.lastName].filter(Boolean).join(' '),
      contacto_cargo: cargo,
      contacto_correo: (c.emails && c.emails[0] && c.emails[0].value) || '',
      contacto_telefono: (c.phones && c.phones[0] && c.phones[0].value) || '',
      contacto_linkedin: c.linkedinUrl || (mejor.socialLinks && mejor.socialLinks.linkedin) || ''
    };
  } catch (e) {
    console.warn('Lusha: no se pudo enriquecer', dominio, '—', e.message);
    return null;
  }
}

function construirLead(n) {
  if (!n.dominio && !n.marca) return null;
  const dominio = n.dominio || (n.marca.toLowerCase().replace(/\s+/g, '') + '.mx');
  const tieneContacto = (n.contacto_telefono || '').trim() || (n.contacto_correo || '').trim() || (n.contacto_linkedin || '').trim();
  if (!tieneContacto) return { descartado: true, dominio };

  const visitasNum = parseInt((n.visitas_mensuales_estimadas || '').replace(/[^0-9]/g, '')) || 0;
  const facturacionClaude = parseInt(String(n.facturacion_estimada_mxn || '').replace(/[^0-9]/g, '')) || 0;
  const facturacionEstimada = facturacionClaude > 0 ? facturacionClaude : (visitasNum > 0 ? Math.round(visitasNum * 0.02 * 900) : 0);

  return {
    descartado: false,
    lead: {
      dominio,
      marca: n.marca || dominio.replace(/^www\./, '').split('.')[0],
      semilla_origen: n.semilla_origen || '',
      visitas_mensuales_estimadas: n.visitas_mensuales_estimadas || '',
      porcentaje_trafico_pagado: n.porcentaje_trafico_pagado || '',
      facturacion_estimada_mxn: facturacionEstimada,
      ads_activos: n.ads_activos || '',
      contacto_nombre: n.contacto_nombre || '',
      contacto_cargo: n.contacto_cargo || '',
      contacto_telefono: n.contacto_telefono || '',
      contacto_correo: n.contacto_correo || '',
      contacto_linkedin: n.contacto_linkedin || '',
      nota_calificacion: n.nota_calificacion || '',
      plataforma: n.plataforma || null,
      fecha_deteccion: new Date().toISOString().split('T')[0],
      estado: 'Nuevo',
      agencia_asignada: null,
      fecha_asignacion: null,
      guion: null,
      notas: ''
    }
  };
}

async function main() {
  const { semillas, output } = parsearArgs(process.argv.slice(2));
  if (semillas.length === 0) {
    console.error('Uso: node scouting/buscar-candidatos.js dominio1.mx dominio2.mx dominio3.mx [--output ruta.json]');
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falta ANTHROPIC_API_KEY en el entorno. Esta llamada SI tiene costo (a diferencia del artifact).');
    process.exit(1);
  }

  const semrushToken = process.env.SEMRUSH_MCP_TOKEN || null;
  const exploriumToken = process.env.EXPLORIUM_MCP_TOKEN || null;
  const lushaKey = process.env.LUSHA_API_KEY || null;
  if (!semrushToken) console.warn('Aviso: sin SEMRUSH_MCP_TOKEN — se omite ese conector, cae a busqueda web normal.');
  if (!exploriumToken) console.warn('Aviso: sin EXPLORIUM_MCP_TOKEN — se omite ese conector, cae a busqueda web normal.');
  if (!lushaKey) console.warn('Aviso: sin LUSHA_API_KEY — no se intenta mejorar contactos genericos.');

  console.log('Investigando semillas:', semillas.join(', '));
  const prompt = construirPrompt(semillas);
  const data = await llamarClaudeConContinuacion(prompt, apiKey, { semrushToken, exploriumToken });

  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  const texto = textBlocks.length ? textBlocks[textBlocks.length - 1].text : '';
  const jsonStr = extraerPrimerArrayJSON(texto);

  if (!jsonStr) {
    if (data.stop_reason === 'max_tokens') {
      console.error('Se corto por limite de tokens antes de llegar al JSON final. Intenta con menos semillas.');
    } else {
      console.error('No se encontro ningun array JSON en la respuesta:\n', texto);
    }
    process.exit(1);
  }

  let crudos;
  try { crudos = JSON.parse(jsonStr); }
  catch (e) {
    console.error('No se pudo leer el JSON:', e.message);
    console.error('Texto completo:\n', jsonStr);
    process.exit(1);
  }

  const leads = [];
  let descartados = 0;
  let mejorados = 0;
  for (const n of crudos) {
    const resultado = construirLead(n);
    if (!resultado) continue;
    if (resultado.descartado) { descartados++; continue; }

    if (lushaKey && !resultado.lead.contacto_nombre) {
      console.log('Buscando contacto con nombre para', resultado.lead.dominio, 'via Lusha...');
      const mejora = await enriquecerContactoLusha(resultado.lead.dominio, lushaKey);
      if (mejora && mejora.contacto_nombre) {
        Object.assign(resultado.lead, mejora);
        mejorados++;
      }
    }

    leads.push(resultado.lead);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(leads, null, 2));

  console.log('---');
  console.log(`Listo. ${leads.length} candidato(s) agregado(s), ${descartados} descartado(s) por falta de contacto, ${mejorados} contacto(s) mejorado(s) con Lusha.`);
  console.log('Guardado en:', output);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { construirPrompt, extraerPrimerArrayJSON, construirLead, parsearArgs, llamarClaudeConContinuacion, enriquecerContactoLusha };
