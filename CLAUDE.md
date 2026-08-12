# Radar de Leads Pautando — Contexto del proyecto

## Qué es esto
Herramienta interna para Partners MX (Tiendanube). Investiga marcas mexicanas que ya
pautan en ads, calcula facturación estimada, detecta plataforma de ecommerce, y encuentra
datos de contacto — todo para que Koresma (Partner Manager) pueda asignar leads a sus
agencias partner y darles seguimiento.

Todo esto se construyó hoy dentro de un artifact de Claude.ai (HTML/JS puro, sin build
step, sin dependencias externas de npm). Ahora se va a seguir desarrollando en Claude Code.

## Archivos en esta carpeta
- `app.html` — la herramienta interactiva sola (buscar candidatos, asignar, guion, etc.)
- `landing.html` — landing de presentación del proyecto, sola
- `app_completo_landing_mas_herramienta.html` — **este es el archivo "real"**: landing +
  herramienta fusionados en un solo archivo (es lo que Koresma tiene publicado hoy).
  Los otros 2 existen porque este se genera programáticamente combinándolos — ver
  sección "Cómo se fusionan" abajo si se necesita regenerar.
- `reporte_estatico_agencias.html` — versión legacy de un solo archivo con los `LEADS`
  hardcodeados en el `<script>`. Reemplazada por `sitio-vercel/` para el deploy real; se
  deja aquí por si algún día se quiere una versión de un solo archivo para GitHub Pages.
- `sitio-vercel/` — sitio estático de solo lectura (sin llamadas a Claude, sin build step)
  que se publica en Vercel desde `https://github.com/Kmiraty21/radar-de-leads`. Ver sección
  "Cómo se publican los resultados en Vercel" abajo.
- `apps_script/Codigo.gs` — Google Apps Script que escribe/lee directo en el Google Sheet
  de Koresma. Se despliega manualmente en el editor de Apps Script del Sheet (no desde
  aquí). Tiene `doPost` (guardar/actualizar un lead) y `doGet` (recibe el clic de la
  agencia desde los botones de status en el correo).

## Arquitectura y por qué es así (importante para no repetir errores de hoy)

**Todo corre dentro de un artifact de Claude.ai.** Esto define TODO lo demás:

1. **Las llamadas a Claude** (`fetch` a `https://api.anthropic.com/v1/messages`) funcionan
   gratis, sin API key, porque Claude.ai las intercepta internamente. Fuera de un artifact
   de Claude.ai, esto no funciona — necesitaría una API key real (con costo) y un backend
   para no exponerla.

2. **El navegador del artifact SOLO puede hacer fetch() a api.anthropic.com.** Confirmado
   con pruebas reales esta noche: fetch directo a Make, a un n8n local, y a un Google Apps
   Script Web App — los 3 fallaron (CORS/sandbox). Por eso NINGUNA integración externa se
   llama con fetch() directo desde el JS del navegador.

3. **La forma que SÍ funciona para hablar con servicios externos:** usar el propio API de
   Claude (fetch a api.anthropic.com) pero pasando el parámetro `mcp_servers` en el body,
   apuntando a un MCP server público (ej. Gmail, Google Drive, Semrush, Vibe
   Prospecting/Explorium). Esto hace que sea EL SERVIDOR de Claude quien le hable al MCP,
   no el navegador del usuario — así se evita el bloqueo de sandbox. Esto SÍ está
   confirmado funcionando para: Gmail (crear borradores), Google Drive (leer archivos).
   Semrush y Vibe Prospecting están conectados pero su impacto real en la calidad de los
   datos no se ha confirmado todavía con una corrida de prueba dedicada.

4. **Google Sheets NO se puede escribir de forma confiable desde ninguna automatización
   que probamos** (Make con conector nativo de Sheets, Make con HTTP a Apps Script, fetch
   directo del navegador a Apps Script) — los 3 fallaron por razones distintas y no
   resueltas. La ÚNICA forma confirmada de escribir en el Sheet es Apps Script ejecutado
   DIRECTAMENTE (desde su propio editor, o por un click de un humano en un link que apunte
   a la Web App URL — eso sí es un navegador normal sin sandbox, no el del artifact).

5. **`window.storage`** (persistencia nativa de artifacts) es la fuente de verdad real de
   la app — todo lo que se ve en pantalla vive ahí, NO en el Google Sheet. El Sheet es un
   destino secundario/de respaldo, no sincronizado en vivo con la app.

## Qué funciona de verdad hoy (probado por el usuario, no solo por mí)
- Buscar candidatos (web search + opcionalmente Semrush/Vibe Prospecting vía MCP)
- Asignar a agencia (14 agencias reales cargadas, ver `AGENCIAS` en el HTML)
- Generar guion de venta (Ángulo de venta / Mensaje de primer contacto / Objeciones)
- Crear borrador en Gmail (vía MCP de Gmail) con plantilla de marca completa
- Marcar "correo enviado" manualmente (checkbox/botón, no automático)
- Tabla de seguimiento con filtro por agencia
- Exportar CSV para pegar a mano en Sheets
- Distribuir leads en bloque entre varias agencias (recién construido, sin probar aún)
- Botones de status (Lead/Opportunity/Won/Onboarding/Lost) en el correo, que la agencia
  clickea → esto SÍ debería funcionar (es un click de navegador normal, no del sandbox)
  pero **no se ha confirmado con una prueba real todavía**
- Botón "Sincronizar pipeline desde Sheet" en la app, que lee el Sheet vía Drive MCP y
  actualiza el pipeline local — tampoco confirmado con prueba real todavía

- Exportar JSON para Vercel (botón nuevo junto al de CSV, recién construido, sin probar
  con datos reales todavía — ver sección de Vercel abajo)

## Qué NO funciona y no vale la pena reintentar sin una idea genuinamente nueva
- Sincronización automática app→Sheets (4 intentos distintos, todos fallaron)
- Envío automático de WhatsApp (Periskope vía MCP — el modelo respondió literalmente que
  no tiene esa capacidad)
- Hospedar la app INTERACTIVA (la que llama a Claude) fuera de Claude.ai sin reconstruir
  el backend, la API key, y la base de datos desde cero. Esto sigue siendo cierto — lo que
  SÍ se hospeda fuera de Claude.ai es solo el reporte de solo lectura (`sitio-vercel/`),
  que no llama a Claude para nada.

## IDs y referencias importantes
- Google Sheet ID: `1i5_nPyHTeGSUDiXRNUP-Z2SCLT_PUa3TjI0ABKRGXdw`
- Nombre de la pestaña: `BBDD | Leads Pautando`
- Apps Script Web App URL: `https://script.google.com/macros/s/AKfycbxylFKSIT4ju5B-7pn2sSRNfeChSZPHPbAspxIbpuLUHzTwdUWGJgqVW5n5RZWwOtM_BQ/exec`
- Gmail conectado: `koresma.chiquillo@tiendanube.com` (vía MCP de Gmail de Claude.ai)
- 14 agencias reales (ver array `AGENCIAS` en `app.html`): We love carts, Suma, Codefy,
  Estudio Merca, Kreads, Cocktail Marketing, reevolution, Fideliza, Ene Conceptos,
  Galarreta, Easyclicks, btiq digital, Velstudio, Rífatela — más "Colorify MX" (única con
  correo real de prueba: Colorify.mx@gmail.com, usado para testing)

## Diseño
Sistema de diseño Nimbus/Tiendanube: azul primario `#0050c3`, fondo oscuro navy
`#000b19`/`#0a1830`, tipografía Plus Jakarta Sans + JetBrains Mono para datos. Estética
"glass card" (fondos semi-transparentes con blur). El correo usa tablas HTML (no divs)
para máxima compatibilidad con Gmail.

## Cómo se fusionan landing.html + app.html
`app_completo_landing_mas_herramienta.html` se generó con un script Python que:
1. Extrae el `<style>` y el `<body>` (menos el `<script>`) de cada archivo
2. Inserta el body de `app.html` como una nueva `<section id="app-section">` dentro del
   body de `landing.html`, justo antes de `<footer>`
3. Concatena ambos `<style>` y ambos `<script>` en el archivo final
4. Cambia los links "Abrir el radar" de la landing para que apunten a `#app-section`
   (scroll interno) en vez de a un link externo

Si se vuelve a necesitar regenerar este archivo tras editar `app.html` o `landing.html`
por separado, ese es el patrón a seguir (no hay build tool, es un script ad-hoc).

## Cómo se publican los resultados en Vercel

El análisis sigue ocurriendo 100% dentro del artifact de Claude.ai (`app.html` /
`app_completo_landing_mas_herramienta.html`) — eso no cambia, porque es lo único gratis y
sin backend propio. Lo que se agregó es una forma de publicar los resultados (no la
herramienta) en un sitio real fuera de Claude, para que las agencias los vean sin entrar
al artifact.

**Por qué es manual:** el navegador del artifact solo puede hacer `fetch()` a
`api.anthropic.com` (ver punto 2 de Arquitectura arriba), así que no hay forma de que el
artifact le haga POST directo a Vercel. La única vía confiable es exportar y subir a mano.

**El flujo:**
1. En la app, botón **"Exportar JSON para Vercel"** (junto al de CSV) — genera un JSON con
   el array `leads` en el formato que espera `sitio-vercel/index.html` y lo deja
   seleccionado en un textarea para copiar.
2. Reemplazar el contenido completo de `sitio-vercel/leads.json` con ese JSON.
3. Commit + push a `https://github.com/Kmiraty21/radar-de-leads` (Vercel ya está
   conectado a este repo con Root Directory = `sitio-vercel/`) → Vercel redeploya solo.
4. `sitio-vercel/index.html` es un HTML estático sin build que hace `fetch('leads.json')`
   en tiempo de carga — no hay hardcodeo de datos en el HTML como en la versión legacy.
   Soporta `?agencia=NombreAgencia` en la URL igual que antes.

**Pendiente de probar con datos reales:** el botón "Exportar JSON para Vercel" se acaba de
construir y se probó con un lead de ejemplo (fetch, formato, filtro por agencia), pero no
con un export real de candidatos desde la app.

## Próximos pasos sugeridos (pendientes, no iniciados)
1. Probar de punta a punta el flujo de status por correo (botones → Sheet → sincronizar)
2. Confirmar si Semrush/Vibe Prospecting de verdad mejoran los datos vs. antes
3. Probar la distribución masiva entre agencias con datos reales
4. Probar de punta a punta el flujo de publicación en Vercel (exportar JSON real → subir →
   ver el sitio actualizado)
5. Considerar si vale la pena una versión con backend real (API key propia + DB) si el
   uso crece more allá de lo que Claude.ai puede sostener gratis
