# Venezuela Resiste — Acopios y Refugios

Mapa colaborativo. Cualquiera reporta un punto y marca su ubicación en el mapa. Los acopios salen al instante con sello "sin verificar". Los refugios esperan tu revisión antes de publicarse.

## Cómo funciona la moderación

| Tipo | Al enviarse | Se ve en el mapa | Tu trabajo |
|------|-------------|------------------|------------|
| Acopio | `por_verificar` | Sí, de una, con sello gris "sin verificar" | Confirmas y cambias a `aprobado` (quita el sello), o borras si es falso |
| Refugio | `pendiente` | No, hasta que tú lo apruebes | Revisas y cambias a `aprobado` |

Quien reporta marca el punto en el mapa, así que **ya no buscas coordenadas a mano**. Llegan en las columnas `lat` y `lng`.

---

## Lo que necesitas

- Cuenta Google (para Sheets + Apps Script)
- Cuenta Vercel (gratis)
- API Key de Google Maps (gratis hasta ~28.000 cargas/mes, pero **pide tarjeta** para activarse)

> **Sobre la tarjeta y la clave.** Google exige una tarjeta para activar la clave de Maps, aunque el uso quede gratis. Esa clave viaja en el código de una página pública: cualquiera la puede ver. Por eso el Paso 3 incluye **restringirla a tu dominio**. Sin esa restricción, alguien podría usar tu clave y gastar contra tu tarjeta. No te saltes ese paso.

---

## Paso 1: Google Sheet

1. Crea un Google Sheet nuevo. Nómbralo "Venezuela Resiste".
2. Crea una hoja llamada **Puntos** con estas columnas exactas en la fila 1:

```
id | tipo | nombre | estado | direccion | lat | lng | contacto | necesidades | capacidad | fuente | reporter | timestamp | estado_moderacion
```

3. Comparte la hoja para que la web pueda leerla: **Compartir > Acceso general > Cualquiera con el enlace > Lector**.
4. Copia el ID del Sheet desde la URL:
   `https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit`

---

## Paso 2: Google Apps Script (recibe los reportes)

1. En el Sheet: **Extensiones > Apps Script**
2. Borra el código existente y pega este:

```javascript
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
```

3. Guarda (Ctrl+S).
4. Despliega: **Implementar > Nueva implementación** > tipo: **Aplicación web** > ejecutar como: **Yo** > acceso: **Cualquier usuario** > Implementar.
5. Copia la URL que te da (termina en `/exec`).

---

## Paso 3: Google Maps API Key (y su candado)

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto nuevo.
3. Activa la API: **Maps JavaScript API**.
4. Crea una credencial: **Credenciales > Crear credencial > Clave de API**.
5. **Restringe la clave (no opcional):**
   - **Restricciones de aplicación > Sitios web (HTTP referrers)**.
   - Agrega tu dominio de Vercel: `https://tu-proyecto.vercel.app/*`
   - Mientras pruebas en tu compu, agrega también `http://localhost:*/*`
   - **Restricciones de API > Restringir clave > Maps JavaScript API**.

Si olvidas este paso, tu clave queda abierta a que cualquiera la use contra tu tarjeta.

---

## Paso 4: Configura los archivos

En `app.js`, dentro de `CONFIG`:
```javascript
SHEET_ID: 'EL_ID_QUE_COPIASTE',
APPS_SCRIPT_URL: 'LA_URL_QUE_TERMINA_EN_/exec',
```

En `index.html`, última línea del script de Google Maps:
```
key=TU_API_KEY
```

(Opcional) En `index.html`, cambia el `href="SHEET_URL"` del pie de la barra lateral por el enlace a tu hoja, o bórralo.

---

## Paso 5: Publicar en Vercel (con Vercel Drop)

La forma más simple, sin terminal ni GitHub:

1. Crea una cuenta gratis en [vercel.com](https://vercel.com) (puedes entrar con tu correo Google).
2. Entra a **[vercel.com/drop](https://vercel.com/drop)**.
3. Arrastra la carpeta `webacopiosrefugios` completa a la página (o súbela como `.zip`).
4. Ponle nombre al proyecto y dale **Deploy**.
5. En segundos te da una URL tipo `https://tu-proyecto.vercel.app`. Esa es tu web.

> Vercel Drop crea un proyecto nuevo en cada arrastre. No te afecta: una vez publicada, **no vuelves a subir archivos**. Los puntos nuevos entran por la Google Sheet, no por Vercel. Solo re-subirías si cambias el diseño.

**Después de publicar:** copia tu URL de Vercel y vuelve al **Paso 3** para agregarla en las restricciones de la clave de Maps (`https://tu-proyecto.vercel.app/*`). Sin eso, el mapa puede no cargar en el sitio público.

¿Quieres actualizaciones automáticas más adelante? Sube la carpeta a un repo de GitHub e impórtalo en Vercel: cada cambio se publica solo. También existe el CLI (`npm i -g vercel`, luego `vercel` en la carpeta) si prefieres la terminal.

---

## Tu rutina de moderación

Cuando entra un reporte:

1. **Refugio** llega como `pendiente` y no se ve. Revisa que sea real y seguro. Si lo es, cambia `estado_moderacion` a `aprobado`. Aparece en el próximo refresco (máx. 90 segundos).
2. **Acopio** llega como `por_verificar` y ya se ve con sello gris. Cuando confirmes que es real, cambia a `aprobado` para quitarle el sello. Si es falso, borra la fila.

Las coordenadas ya vienen llenas (`lat`, `lng`), porque quien reporta marcó el punto en el mapa. Si quieres ajustar una, busca el lugar en Google Maps, clic derecho, copiar coordenadas, y pégalas en las celdas.

---

## Si la facturación de Google te traba

Avísame y cambio el mapa a **Leaflet + OpenStreetMap**: mismo comportamiento, sin clave, sin tarjeta. Es un cambio de unos minutos en `index.html` y `app.js`.
# acopios-refugios
