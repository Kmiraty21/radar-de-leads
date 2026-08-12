// Pega esto completo en: tu Sheet > Extensiones > Apps Script
// Luego: Implementar > Administrar implementaciones > editar (lapiz) > Nueva version > Implementar
// (No necesitas una URL nueva si ya tenias una implementacion — la misma URL sirve para esta version tambien)

var SPREADSHEET_ID = '1i5_nPyHTeGSUDiXRNUP-Z2SCLT_PUa3TjI0ABKRGXdw';
var SHEET_NAME = 'BBDD | Leads Pautando';

var ALIAS = { 'plataforma_detectada': 'plataforma' };
var ESTADOS_VALIDOS = ['Lead', 'Opportunity', 'Won', 'Onboarding', 'Lost'];

// ===== Recibe datos de la app (guardar/actualizar un lead) =====
function doPost(e) {
  try {
    var data;
    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }
    var resultado = guardarOActualizarFila(data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: resultado }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== Recibe el clic de la agencia desde el correo (actualizar solo el status) =====
function doGet(e) {
  try {
    var dominio = e.parameter.dominio;
    var estado = e.parameter.estado;
    if (!dominio || !estado) throw new Error('Faltan parametros dominio o estado.');
    if (ESTADOS_VALIDOS.indexOf(estado) === -1) throw new Error('Estado no valido: ' + estado);

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('No se encontro la pestana: ' + SHEET_NAME);

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var domCol = headers.findIndex(function(h) { return normalizar(h) === 'dominio'; });
    var pipelineCol = headers.findIndex(function(h) { return normalizar(h) === 'pipeline_status'; });
    if (pipelineCol === -1) throw new Error('No existe la columna Pipeline_Status en el Sheet. Agregala primero.');

    var lastRow = sheet.getLastRow();
    var targetRow = -1;
    if (lastRow > 1 && domCol > -1) {
      var dominios = sheet.getRange(2, domCol + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < dominios.length; i++) {
        if (dominios[i][0] === dominio) { targetRow = i + 2; break; }
      }
    }
    if (targetRow === -1) throw new Error('No se encontro el dominio ' + dominio + ' en el Sheet.');

    sheet.getRange(targetRow, pipelineCol + 1).setValue(estado);

    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif; text-align:center; padding:60px 20px; background:#000b19; color:#fff; min-height:100vh;">' +
      '<h2 style="color:#6be3a0;">Listo, actualizamos el status</h2>' +
      '<p style="color:#9ca3af;">' + dominio + ' ahora esta marcado como <b style="color:#fff;">' + estado + '</b>.</p>' +
      '<p style="color:#6b7280; font-size:13px; margin-top:20px;">Ya puedes cerrar esta pestana.</p></div>'
    );
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif; text-align:center; padding:60px 20px;">' +
      '<h2 style="color:#d64545;">No se pudo actualizar</h2><p>' + err.message + '</p></div>'
    );
  }
}

function guardarOActualizarFila(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontro la pestana: ' + SHEET_NAME);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var domCol = headers.findIndex(function(h) { return normalizar(h) === 'dominio'; });
  var lastRow = sheet.getLastRow();
  var targetRow = -1;

  if (lastRow > 1 && domCol > -1) {
    var dominios = sheet.getRange(2, domCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dominios.length; i++) {
      if (dominios[i][0] === data.dominio) { targetRow = i + 2; break; }
    }
  }

  var fila = headers.map(function(h) {
    var key = normalizar(h);
    key = ALIAS[key] || key;
    if (data[key] !== undefined) return data[key];
    var altKey = Object.keys(data).find(function(k) { return normalizar(k) === key; });
    return altKey ? data[altKey] : '';
  });

  if (targetRow > -1) {
    sheet.getRange(targetRow, 1, 1, fila.length).setValues([fila]);
    return targetRow;
  } else {
    sheet.appendRow(fila);
    return sheet.getLastRow();
  }
}

function normalizar(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '_');
}
