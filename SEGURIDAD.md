# Seguridad — Venezuela Resiste

Documento de dos partes: el **blindaje de emergencia** (hazlo ya) y el **plan de migración a Supabase** (siguiente paso, seguridad real).

---

## Qué cambió en el código (ya hecho)

- El Apps Script ahora **divide la escritura**: la hoja pública recibe solo datos seguros; una hoja **privada** recibe el nombre de quien reporta y su verificación.
- El formulario exige **CAPTCHA** (Cloudflare Turnstile). El Apps Script rechaza cualquier envío sin token válido.
- Validación del lado del servidor: tipo correcto, longitudes máximas, coordenadas dentro de rango. Frena basura y envenenamiento.
- `app.js` ya no manda el nombre ni la verificación a la columna pública.

Para que esto funcione, faltan 6 pasos tuyos.

---

## Blindaje de emergencia — checklist

### Paso 1: Crea la hoja PRIVADA
1. Crea un Google Sheet **nuevo**. Nómbralo `Venezuela Resiste - Privado`.
2. **No lo compartas.** Déjalo restringido (solo tú).
3. Crea una pestaña llamada `Moderacion` con estos encabezados en la fila 1:

```
id | timestamp | tipo | nombre | direccion | reporter | verificacion | contacto
```

4. Copia su ID desde la URL (la parte larga entre `/d/` y `/edit`).

### Paso 2: CAPTCHA gratis (Cloudflare Turnstile)
1. Crea una cuenta gratis en [dash.cloudflare.com](https://dash.cloudflare.com).
2. Entra a **Turnstile > Add site**.
3. Hostnames: `acopios-refugios.vercel.app` y `localhost`.
4. Widget mode: **Managed**.
5. Te da dos claves: **Site Key** (pública) y **Secret Key** (privada). Cópialas.

### Paso 3: Pega las claves
En `apps-script.gs` (dentro del editor de Apps Script):
```javascript
var PRIVATE_SHEET_ID = 'EL_ID_DE_TU_HOJA_PRIVADA';
var TURNSTILE_SECRET = 'TU_SECRET_KEY';
```
En `index.html`, donde dice `data-sitekey="TU_SITE_KEY_TURNSTILE"`, pega tu **Site Key**.

### Paso 4: Redesplega el Apps Script
1. En Apps Script: **Implementar > Administrar implementaciones**.
2. Edita la implementación existente (ícono de lápiz) > **Versión: Nueva** > **Implementar**. Así la URL `/exec` se mantiene.
3. Autoriza los permisos nuevos cuando los pida (ahora el script accede a otra hoja y a internet para verificar el CAPTCHA).

### Paso 5: Limpia lo ya expuesto
1. En la hoja pública **Puntos**, borra el contenido de la columna `reporter` (deja el encabezado).
2. Si en `fuente` hay textos personales de reportes viejos (ej. "me lo dijo mi vecina X"), bórralos o reemplázalos por `Reporte ciudadano`.

### Paso 6: Publica
Sube a GitHub `index.html`, `app.js` y `style.css`. Vercel redespliega solo.

### Paso 7: Cierra la lectura (pon la hoja en PRIVADA)
Esto es lo que cierra la fuga de lectura. El sitio ya no lee la hoja directa: la lee a través del Apps Script (función `doGet`), que solo entrega lo aprobado y las columnas públicas.

**El orden importa, para no romper el sitio:**
1. Confirma que el Apps Script quedó redesplegado con el código nuevo (Paso 4) y que `app.js` ya está publicado (Paso 6).
2. Abre el sitio en vivo y verifica que **los puntos cargan** (ya vienen por el proxy).
3. Solo entonces, en la Google Sheet pública: **Compartir > Acceso general > Restringido** (solo tú). Quita el "Cualquiera con el enlace".
4. Recarga el sitio. Si sigue mostrando los puntos, listo: la hoja ya es privada y nadie de afuera la puede leer.

> Si pones la hoja en privada ANTES de publicar el código nuevo, el sitio se queda sin datos. Primero publica y verifica, luego restringe.

---

## Qué queda protegido, y qué no

**Protegido:**
- El nombre de quien reporta y su verificación ya no llegan a la hoja pública; quedan en tu hoja privada.
- El formulario exige CAPTCHA: se frena el spam y los envíos automatizados.
- La validación server-side rechaza datos malformados.

**Ya cerrado con el proxy (Paso 7):**
- La hoja deja de ser legible por cualquiera. El sitio lee a través del Apps Script, que entrega solo filas visibles y solo columnas públicas. El nombre de quien reporta, la verificación y los refugios `pendiente` ya no salen de la hoja.

**Lo único a vigilar:**
- El Apps Script tiene topes de uso diarios (cuotas de Google). Para tu escala normal sobra; solo un pico viral muy fuerte podría rozarlos. Si el sitio crece muchísimo, ahí sí conviene migrar a Supabase (plan abajo).

---

## Opcional, a futuro: migrar a Supabase

Ya no es urgente. Con el proxy, la hoja es privada y solo sale lo público. Esto queda como upgrade **solo si el sitio crece tanto que las cuotas del Apps Script se quedan cortas**. Supabase (Postgres gratis, sin tarjeta) da una API que escala mejor y **Row Level Security (RLS)**: reglas de quién ve qué fila y qué columna.

**Cómo quedaría:**
- Tabla `puntos`: columnas públicas (tipo, nombre, estado, direccion, lat, lng, contacto, necesidades, capacidad, estado_moderacion) + columnas privadas (reporter, verificacion).
- Una **vista pública** que expone solo las columnas públicas y solo las filas visibles (acopios `por_verificar`/`aprobado`, refugios `aprobado`). El público lee de esa vista con la `anon key`. Lo pendiente y lo sensible quedan invisibles.
- Tabla/columnas sensibles: sin política de lectura anónima. Solo accesibles con tu `service key`.
- **Escritura** vía una Edge Function que valida + verifica Turnstile + inserta. La `anon key` no inserta directo.
- `app.js` lee de la API REST de Supabase en vez de `gviz`; el formulario llama la Edge Function.

**Esfuerzo:** cuenta Supabase, crear las tablas, la vista y las políticas RLS, una Edge Function, y reconectar `app.js`. Es la mudanza correcta para datos de una crisis. Cuando quieras, lo armamos paso a paso.
