// ============================================================
//  Apps Script ENDURECIDO para "Venezuela Resiste"
//  - Verifica CAPTCHA (Cloudflare Turnstile) antes de aceptar
//  - Valida los datos (tipo, longitudes, coordenadas)
//  - Escritura DIVIDIDA:
//      * Hoja PÚBLICA (Puntos): solo datos seguros, SIN nombre de
//        quien reporta ni texto de verificación.
//      * Hoja PRIVADA (otra hoja, NO compartida): datos sensibles.
//  Pegar este código en: Extensiones > Apps Script
// ============================================================

// 1) ID de tu hoja PRIVADA (créala nueva, NO la compartas). Ver checklist.
var PRIVATE_SHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_HOJA_PRIVADA';

// 2) Clave SECRETA de Cloudflare Turnstile (server-side). Ver checklist.
var TURNSTILE_SECRET = 'PEGA_AQUI_TU_CLAVE_SECRETA_DE_TURNSTILE';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot: si viene lleno, es un bot. Fingimos éxito y salimos.
    if (data.website) return ok();

    // CAPTCHA obligatorio
    if (!verifyTurnstile(data.captchaToken)) return fail('captcha');

    // Validación del lado del servidor
    var v = validate(data);
    if (!v.ok) return fail(v.error);

    var id = Utilities.getUuid();
    var ts = data.timestamp || new Date().toISOString();
    var estadoMod = data.tipo === 'acopio' ? 'por_verificar' : 'pendiente';

    // --- HOJA PÚBLICA: 14 columnas, SIN datos personales ---
    // reporter va vacío; fuente queda como etiqueta genérica.
    var pub = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Puntos');
    pub.appendRow([
      id,
      data.tipo,
      data.nombre,
      data.estado || '',
      data.direccion,
      data.lat,
      data.lng,
      data.contacto || '',
      data.necesidades || '',
      data.capacidad || '',
      'Reporte ciudadano',   // fuente (pública, genérica)
      '',                    // reporter SIEMPRE vacío en la hoja pública
      ts,
      estadoMod
    ]);

    // --- HOJA PRIVADA: datos sensibles, fuera del alcance público ---
    var priv = SpreadsheetApp.openById(PRIVATE_SHEET_ID).getSheetByName('Moderacion');
    priv.appendRow([
      id,
      ts,
      data.tipo,
      data.nombre,
      data.direccion,
      data.reporter || '',       // nombre de quien reporta (privado)
      data.verificacion || '',   // cómo lo verificó (privado)
      data.contacto || ''
    ]);

    return ok();
  } catch (err) {
    return fail(err.message);
  }
}

// Verifica el token contra Cloudflare Turnstile
function verifyTurnstile(token) {
  if (!token) return false;
  try {
    var resp = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post',
      payload: { secret: TURNSTILE_SECRET, response: token },
      muteHttpExceptions: true
    });
    var r = JSON.parse(resp.getContentText());
    return r.success === true;
  } catch (err) {
    return false;
  }
}

// Validación básica para frenar basura y envenenamiento de datos
function validate(d) {
  if (['acopio', 'refugio'].indexOf(d.tipo) < 0) return { ok: false, error: 'tipo' };
  if (!d.nombre || String(d.nombre).length > 200) return { ok: false, error: 'nombre' };
  if (!d.direccion || String(d.direccion).length > 400) return { ok: false, error: 'direccion' };
  var lat = parseFloat(d.lat), lng = parseFloat(d.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: 'coords' };
  }
  if (String(d.necesidades || '').length > 600) return { ok: false, error: 'necesidades' };
  if (String(d.contacto || '').length > 200) return { ok: false, error: 'contacto' };
  return { ok: true };
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  LECTURA SEGURA (proxy). El sitio lee POR AQUÍ, no la hoja directa.
//  Devuelve SOLO filas visibles y SOLO columnas públicas (sin
//  reporter ni fuente). Soporta JSONP (?callback=) para el navegador.
//  Con esto puedes poner la hoja en PRIVADA.
// ============================================================

function doGet(e) {
  var json = JSON.stringify(getPublicPoints());
  var callback = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : '';
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getPublicPoints() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('puntos_publicos');
  if (hit) return JSON.parse(hit);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Puntos');
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var h = {};
  values[0].forEach(function (name, i) { h[String(name).trim().toLowerCase()] = i; });

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var tipo = String(row[h['tipo']] || '').trim().toLowerCase();
    var mod = String(row[h['estado_moderacion']] || '').trim().toLowerCase();
    var lat = row[h['lat']], lng = row[h['lng']];
    if (lat === '' || lng === '' || lat === null || lng === null) continue;

    // Visibilidad: acopio (por_verificar/aprobado) o refugio (solo aprobado)
    var visible = (mod === 'aprobado') || (tipo === 'acopio' && mod === 'por_verificar');
    if (!visible) continue;

    // SOLO columnas públicas. reporter y fuente NUNCA salen.
    out.push({
      tipo: tipo,
      nombre: row[h['nombre']],
      estado: row[h['estado']],
      direccion: row[h['direccion']],
      lat: lat,
      lng: lng,
      contacto: row[h['contacto']] || '',
      necesidades: row[h['necesidades']] || '',
      capacidad: row[h['capacidad']] || '',
      estado_moderacion: mod
    });
  }
  cache.put('puntos_publicos', JSON.stringify(out), 60);
  return out;
}
