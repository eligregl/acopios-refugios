// ============================================================
//  Apps Script para "Venezuela Resiste"
//  Recibe los reportes del formulario y los guarda en la hoja "Puntos".
//  Pegar este código completo en: Extensiones > Apps Script
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Anti-spam: si el honeypot viene lleno, es un bot. No escribimos nada.
    if (data.website) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // El estado lo decide el servidor, no el cliente.
    // Acopio entra como por_verificar (visible). Refugio como pendiente (oculto).
    const estadoModeracion = data.tipo === 'acopio' ? 'por_verificar' : 'pendiente';

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Puntos');
    const row = [
      Utilities.getUuid(),
      data.tipo || '',
      data.nombre || '',
      data.estado || '',
      data.direccion || '',
      data.lat || '',
      data.lng || '',
      data.contacto || '',
      data.necesidades || '',
      data.capacidad || '',
      data.fuente || '',
      data.reporter || '',
      data.timestamp || new Date().toISOString(),
      estadoModeracion
    ];

    sheet.appendRow(row);

    // Notificación por email (opcional): descomenta y pon tu correo.
    // MailApp.sendEmail('tu@email.com', 'Nuevo reporte: ' + data.tipo, JSON.stringify(data));

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
