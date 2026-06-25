// ============================================================
//  CONFIGURACIÓN — edita estos valores antes de publicar
// ============================================================

const CONFIG = {
  // ID de tu Google Sheet (la parte larga de la URL)
  SHEET_ID: '1gYml0XSASjqnfRsv1DOWD5B3d7WKRVtiP6eAhQ9QBwg',

  // URL de tu Google Apps Script Web App (ver README)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzKAcMzH739iu1nL6ztBmm3uymajUy6V0lPEQmbQeBjABUJ84odAxEnv0QD9Cjy5pP0Tw/exec',

  // Coordenadas iniciales del mapa (centro de Venezuela)
  MAP_CENTER: { lat: 10.4806, lng: -66.9036 },
  MAP_ZOOM: 7,

  // Cada cuánto recarga los puntos (ms)
  REFRESH_MS: 90 * 1000,
};

// ============================================================
//  ESTADO DE LA APP
// ============================================================

let map = null;
let markers = [];
let allPoints = [];
let activeFilter = 'all';

// Mini-mapa del formulario (donde quien reporta marca el punto)
let reportMap = null;
let reportMarker = null;

// ============================================================
//  SEGURIDAD — escapa todo dato de usuario antes del DOM
// ============================================================

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
//  REGLAS DE VISIBILIDAD (moderación híbrida)
//  - Acopio: visible si por_verificar o aprobado
//  - Refugio: visible solo si aprobado
// ============================================================

function tipoDe(p) {
  return (p.tipo || '').trim().toLowerCase();
}

function estadoMod(p) {
  return (p.estado_moderacion || '').trim().toLowerCase();
}

function isVisible(p) {
  if (!p.lat || !p.lng) return false;
  const t = tipoDe(p);
  const m = estadoMod(p);
  if (m === 'aprobado') return true;
  if (t === 'acopio' && m === 'por_verificar') return true;
  return false;
}

function isUnverified(p) {
  return estadoMod(p) !== 'aprobado';
}

// ============================================================
//  INICIALIZAR MAPA (callback de Google Maps)
// ============================================================

window.initMap = function () {
  map = new google.maps.Map(document.getElementById('map'), {
    center: CONFIG.MAP_CENTER,
    zoom: CONFIG.MAP_ZOOM,
    styles: darkMapStyles(),
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  loadPoints();
};

// Google llama a esta función si la clave es inválida o falta facturación
window.gm_authFailure = showMapError;

function showMapError() {
  const banner = document.getElementById('mapError');
  if (banner) banner.style.display = 'block';
  const label = document.getElementById('countLabel');
  if (label) label.textContent = 'Mapa sin clave';
  const note = document.getElementById('reportMapNote');
  if (note) note.textContent = 'El mapa no cargó. Revisa la clave de Google Maps en el README.';
}

// Si el script de Maps nunca carga (clave de ejemplo sin reemplazar), avisa
setTimeout(function () {
  if (!map && !window.google) showMapError();
}, 5000);

// ============================================================
//  CARGAR PUNTOS DESDE GOOGLE SHEETS (publicado como CSV)
// ============================================================

async function loadPoints() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Puntos`;
    const res = await fetch(url);
    const csv = await res.text();

    allPoints = parseCSV(csv);
    renderAll();
    updateTimestamp();
  } catch (err) {
    console.error('Error cargando puntos:', err);
    document.getElementById('pointList').innerHTML =
      '<li class="loading-item">Error cargando datos. Recarga la página.</li>';
  }
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // Encabezados: id, tipo, nombre, estado, direccion, lat, lng, contacto,
  // necesidades, capacidad, fuente, reporter, timestamp, estado_moderacion
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

  return lines.slice(1)
    .map(line => {
      const values = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (values[i] || '').replace(/"/g, '').trim(); });
      return obj;
    })
    .filter(isVisible);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += line[i]; }
  }
  result.push(current);
  return result;
}

// ============================================================
//  RENDERIZAR MAPA Y LISTA
// ============================================================

function renderAll() {
  const filtered = activeFilter === 'all'
    ? allPoints
    : allPoints.filter(p => tipoDe(p) === activeFilter);

  clearMarkers();
  filtered.forEach(addMarker);
  renderList(filtered);
  document.getElementById('countLabel').textContent =
    `${filtered.length} punto${filtered.length !== 1 ? 's' : ''}`;
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
}

function addMarker(point) {
  if (!point.lat || !point.lng || !map) return;

  const t = tipoDe(point);
  const unverified = isUnverified(point);
  const typeColor = t === 'acopio' ? '#F4C430' : '#3FBFA6';
  const fill = unverified ? '#7A95B0' : typeColor;
  const icon = t === 'acopio' ? '📦' : '🏠';

  const marker = new google.maps.Marker({
    position: { lat: parseFloat(point.lat), lng: parseFloat(point.lng) },
    map,
    title: point.nombre,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: fill,
      fillOpacity: 1,
      strokeColor: unverified ? typeColor : '#0F1923',
      strokeWeight: 2,
    },
  });

  const badge = unverified
    ? '<span style="display:inline-block;font-size:9px;letter-spacing:.04em;background:#7A95B0;color:#0F1923;padding:1px 5px;border-radius:2px;margin-left:4px;vertical-align:middle">SIN VERIFICAR</span>'
    : '';

  const infoContent = `
    <div style="font-family:'IBM Plex Sans',sans-serif;max-width:230px;padding:4px 0">
      <strong style="font-size:13px">${icon} ${esc(point.nombre)}</strong>${badge}
      <p style="font-size:11px;color:#666;margin:4px 0">${esc(point.estado)} — ${esc(point.direccion)}</p>
      ${point.necesidades ? `<p style="font-size:11px;margin:4px 0"><b>Reciben:</b> ${esc(point.necesidades)}</p>` : ''}
      ${point.capacidad ? `<p style="font-size:11px;margin:4px 0"><b>Capacidad:</b> ${esc(point.capacidad)}</p>` : ''}
      ${point.contacto ? `<p style="font-size:11px;color:#2563A8;margin:4px 0">${esc(point.contacto)}</p>` : ''}
    </div>`;

  const infoWindow = new google.maps.InfoWindow({ content: infoContent });
  marker.addListener('click', () => infoWindow.open(map, marker));
  markers.push(marker);
}

function renderList(points) {
  const list = document.getElementById('pointList');

  if (points.length === 0) {
    list.innerHTML = '<li class="loading-item">No hay puntos con este filtro.</li>';
    return;
  }

  list.innerHTML = points.map(p => {
    const t = tipoDe(p);
    const unv = isUnverified(p);
    const dotClass = t === 'acopio' ? 'dot-acopio' : 'dot-refugio';
    return `
    <li class="point-item ${unv ? 'por-verificar' : ''}" data-lat="${parseFloat(p.lat)}" data-lng="${parseFloat(p.lng)}">
      <div class="point-item-header">
        <span class="dot ${dotClass}${unv ? ' dot-unv' : ''}"></span>
        <span class="point-name">${esc(p.nombre)}</span>
        ${unv ? '<span class="badge-verificar">sin verificar</span>' : ''}
      </div>
      <div class="point-estado">${esc(p.estado)}</div>
      <div class="point-detail">${esc(p.direccion)}${p.necesidades ? ' · ' + esc(p.necesidades) : ''}${p.capacidad ? ' · Cap: ' + esc(p.capacidad) : ''}</div>
      ${p.contacto ? `<div class="point-contact">${esc(p.contacto)}</div>` : ''}
    </li>`;
  }).join('');

  // Listeners por dataset (evita inyección vía atributos inline)
  list.querySelectorAll('.point-item').forEach(li => {
    li.addEventListener('click', () => {
      focusPoint(parseFloat(li.dataset.lat), parseFloat(li.dataset.lng));
    });
  });
}

function focusPoint(lat, lng) {
  if (!map || isNaN(lat) || isNaN(lng)) return;
  map.setCenter({ lat, lng });
  map.setZoom(14);
}

// ============================================================
//  FILTROS
// ============================================================

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.type;
    renderAll();
  });
});

// ============================================================
//  MODAL
// ============================================================

const overlay = document.getElementById('modalOverlay');

function openModal() {
  overlay.classList.add('open');
  initReportMap();
}

function closeModal() {
  overlay.classList.remove('open');
}

document.getElementById('openModalBtn').addEventListener('click', openModal);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// Mostrar/ocultar campos según tipo
document.getElementById('tipo').addEventListener('change', function () {
  document.getElementById('acopioFields').style.display = this.value === 'acopio' ? 'block' : 'none';
  document.getElementById('refugioFields').style.display = this.value === 'refugio' ? 'block' : 'none';
});

// ============================================================
//  MINI-MAPA DEL FORMULARIO — quien reporta marca el punto
// ============================================================

function initReportMap() {
  if (!window.google || !google.maps) {
    document.getElementById('reportMapNote').textContent =
      'El mapa no cargó. Revisa la clave de Google Maps en el README.';
    return;
  }

  if (reportMap) {
    google.maps.event.trigger(reportMap, 'resize');
    reportMap.setCenter(CONFIG.MAP_CENTER);
    return;
  }

  reportMap = new google.maps.Map(document.getElementById('reportMap'), {
    center: CONFIG.MAP_CENTER,
    zoom: 7,
    styles: darkMapStyles(),
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'greedy',
  });

  reportMap.addListener('click', e => setReportMarker(e.latLng));
}

function setReportMarker(latLng) {
  if (reportMarker) {
    reportMarker.setPosition(latLng);
  } else {
    reportMarker = new google.maps.Marker({
      position: latLng,
      map: reportMap,
      draggable: true,
    });
    reportMarker.addListener('dragend', ev => writeCoords(ev.latLng));
  }
  writeCoords(latLng);
  document.getElementById('reportMapNote').textContent = 'Punto marcado. Arrástralo para ajustar.';
}

function writeCoords(latLng) {
  document.getElementById('lat').value = latLng.lat();
  document.getElementById('lng').value = latLng.lng();
}

function clearReportMarker() {
  if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
  document.getElementById('lat').value = '';
  document.getElementById('lng').value = '';
  const note = document.getElementById('reportMapNote');
  if (note) note.textContent = 'Toca el mapa donde queda el punto.';
}

// ============================================================
//  ENVÍO DE FORMULARIO -> GOOGLE APPS SCRIPT
// ============================================================

document.getElementById('reportForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  // Honeypot: si un bot llenó este campo oculto, fingimos éxito y salimos
  if (document.getElementById('website').value) {
    showSuccess('acopio');
    return;
  }

  const tipo = document.getElementById('tipo').value;
  const lat = document.getElementById('lat').value;
  const lng = document.getElementById('lng').value;

  if (!lat || !lng) {
    alert('Marca el punto en el mapa antes de enviar.');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  // Acopio sale al instante (por_verificar). Refugio espera aprobación (pendiente).
  const estadoModeracion = tipo === 'acopio' ? 'por_verificar' : 'pendiente';

  const data = {
    tipo,
    nombre:       document.getElementById('nombre').value,
    estado:       document.getElementById('estado').value,
    direccion:    document.getElementById('direccion').value,
    lat,
    lng,
    contacto:     document.getElementById('contacto').value,
    necesidades:  document.getElementById('necesidades').value,
    capacidad:    document.getElementById('capacidad').value,
    fuente:       document.getElementById('fuente').value,
    reporter:     document.getElementById('reporterName').value,
    timestamp:    new Date().toISOString(),
    estado_moderacion: estadoModeracion,
  };

  try {
    await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    showSuccess(tipo);
    // Recarga para que el acopio aparezca pronto en el mapa de quien reportó
    setTimeout(loadPoints, 4000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Enviar reporte';
    alert('Error al enviar. Intenta de nuevo o escríbenos directamente.');
  }
});

function showSuccess(tipo) {
  document.getElementById('reportForm').style.display = 'none';
  document.getElementById('formSuccess').style.display = 'block';

  const msg = document.getElementById('successMsg');
  if (msg) {
    msg.textContent = tipo === 'acopio'
      ? 'Aparece en el mapa en uno o dos minutos con el sello "sin verificar". Gracias por ayudar.'
      : 'Un voluntario lo revisa antes de publicarlo, por seguridad de quien busca refugio. Gracias por ayudar.';
  }
}

document.getElementById('newReportBtn').addEventListener('click', () => {
  const form = document.getElementById('reportForm');
  form.reset();
  clearReportMarker();
  document.getElementById('acopioFields').style.display = 'block';
  document.getElementById('refugioFields').style.display = 'none';
  form.style.display = 'block';
  document.getElementById('formSuccess').style.display = 'none';
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').textContent = 'Enviar reporte';
});

// ============================================================
//  TIMESTAMP
// ============================================================

function updateTimestamp() {
  const now = new Date();
  document.getElementById('lastUpdate').textContent =
    now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

// Recargar datos periódicamente
setInterval(loadPoints, CONFIG.REFRESH_MS);

// ============================================================
//  ESTILOS DEL MAPA (dark mode)
// ============================================================

function darkMapStyles() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#162030' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0F1923' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#7A95B0' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243448' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7A95B0' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F1923' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#243448' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#C0392B' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#E8EDF2' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];
}
