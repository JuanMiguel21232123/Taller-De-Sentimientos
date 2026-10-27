const SUPABASE_URL = 'https://exxnlurtgorxdditbrak.supabase.co';
const SUPABASE_KEY = 'sb_publishable_d4jrBZ2orxTW0TTYvB3xQg_NplhbrYL'; // clave pública: la seguridad la dan la sesión y las políticas RLS
const BUCKET = 'product-images';
const MAX_MB = 3;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const storage = () => db.storage.from(BUCKET);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n).toLocaleString('es-CO');
const isImg = v => /^(https?:|data:|blob:)/.test(v || '');
const thumb = v => isImg(v) ? `<img src="${esc(v)}" alt="">` : esc(v || '🎁');

let products = [], sales = [], orders = [], ofilter = 'todos', ptype = 'day', editing = null, loaded = false, lowLimit = 3;

function msg(text, isError) {
  const m = $('#msg');
  m.textContent = text || '';
  m.className = 'msg' + (isError ? ' error' : '');
  m.hidden = !text;
}

// ---------- Imágenes (bucket) ----------
const pathFromUrl = url => {
  const marker = `/object/public/${BUCKET}/`;
  const i = String(url || '').indexOf(marker);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
};

async function removeImage(url) {
  const path = pathFromUrl(url);
  if (path) await storage().remove([path]);
}

function setPreview(v) {
  const el = $('#preview');
  el.innerHTML = v ? (isImg(v) ? `<img src="${esc(v)}" alt="Vista previa">` : esc(v)) : '';
  el.hidden = !v;
}

const current = () => products.find(p => p.id === editing);

$('#pic').addEventListener('change', () => {
  const f = $('#pic').files[0];
  if (!f) return setPreview(editing ? current()?.pic : '');
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > MAX_MB * 1024 * 1024) {
    $('#pic').value = '';
    setPreview(editing ? current()?.pic : '');
    return msg(`La imagen debe ser JPG, PNG o WebP y pesar máximo ${MAX_MB} MB.`, true);
  }
  msg('');
  setPreview(URL.createObjectURL(f));
});

// ---------- Sesión ----------
function showSession(session) {
  $('#login').hidden = !!session;
  $('#app').hidden = !session;
  $('#logout').hidden = !session;
  $('#count').hidden = !session;
  $('#who').textContent = session ? session.user.email : '';
  if (session) $('#saleDate').value = $('#saleDate').value || fmt(new Date());
  if (session && !loaded) { loaded = true; load(); loadOrders(); loadSettings(); }
  if (!session) { loaded = false; products = []; sales = []; orders = []; resetForm(); showTab('productos'); }
}

db.auth.onAuthStateChange((_event, session) => showSession(session));

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  msg('');
  $('#loginBtn').disabled = true;
  const { error } = await db.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
  $('#loginBtn').disabled = false;
  if (error) return msg('Correo o contraseña incorrectos.', true);
  $('#password').value = '';
});

$('#logout').addEventListener('click', () => { msg(''); db.auth.signOut(); });

// ---------- Productos ----------
async function load() {
  const { data, error } = await db.from('products').select('*').order('created_at', { ascending: true });
  if (error) return msg('No se pudo cargar el catálogo: ' + error.message, true);
  products = data;
  render();
}

function render() {
  $('#rows').innerHTML = products.map(p => `<tr class="${p.visible ? '' : 'dim'}"><td class="t"><div class="th">${thumb(p.pic)}</div></td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock == null ? 'Sin control' : p.stock === 0 ? '<b class="warn">Agotado</b>' : p.stock <= lowLimit ? `<b class="warn">${p.stock} · bajo</b>` : p.stock}</td><td>${p.visible ? 'Visible' : 'Oculto'}</td><td class="acts"><button data-edit="${p.id}">Editar</button><button data-toggle="${p.id}">${p.visible ? 'Ocultar' : 'Mostrar'}</button><button class="del" data-del="${p.id}">Eliminar</button></td></tr>`).join('')
    || '<tr><td colspan="7">Aún no hay productos. Agrega el primero desde el formulario.</td></tr>';
  $('#cats').innerHTML = [...new Set(products.map(p => p.category))].map(c => `<option value="${esc(c)}">`).join('');
  $('#count').textContent = products.length + ' productos';
  const low = products.filter(p => p.visible && p.stock != null && p.stock <= lowLimit);
  $('#stockAlert').hidden = !low.length;
  $('#stockAlert').textContent = low.length ? `Stock bajo (${low.length}): ` + low.map(p => `${p.name} (${p.stock === 0 ? 'agotado' : p.stock})`).join(', ') : '';
  renderSaleOptions();
}

function resetForm() {
  editing = null;
  $('#form').reset();
  $('#pic').required = true;
  $('#picHint').textContent = 'JPG, PNG o WebP, máximo 3 MB.';
  setPreview('');
  $('#formTitle').textContent = 'Nuevo producto';
  $('#saveBtn').textContent = 'Guardar producto';
  $('#cancelBtn').hidden = true;
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  msg('');
  const file = $('#pic').files[0];
  const prev = editing ? current() : null;
  let url = prev ? prev.pic : '🎁', uploaded = null;
  $('#saveBtn').disabled = true;

  if (file) {
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    uploaded = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await storage().upload(uploaded, file, { contentType: file.type, cacheControl: '31536000' });
    if (upErr) { $('#saveBtn').disabled = false; return msg('No se pudo subir la imagen: ' + upErr.message, true); }
    url = storage().getPublicUrl(uploaded).data.publicUrl;
  }

  const row = {
    name: $('#name').value.trim(),
    price: Math.round(Number($('#price').value)),
    category: $('#category').value.trim(),
    pic: url,
    description: $('#desc').value.trim(),
    stock: $('#stock').value === '' ? null : Math.max(0, Math.round(Number($('#stock').value))),
    visible: $('#visible').checked
  };
  const { error } = editing
    ? await db.from('products').update(row).eq('id', editing)
    : await db.from('products').insert(row);
  $('#saveBtn').disabled = false;

  if (error) {
    if (uploaded) await storage().remove([uploaded]); // no dejar imágenes huérfanas
    return msg('No se pudo guardar: ' + error.message, true);
  }
  if (file && prev) await removeImage(prev.pic); // 1 imagen por producto: borra la anterior
  msg(editing ? 'Cambios guardados.' : 'Producto agregado.');
  resetForm();
  load();
});

$('#cancelBtn').addEventListener('click', resetForm);

$('#rows').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.toggle) {
    const p = products.find(x => x.id == b.dataset.toggle); if (!p) return;
    const { error } = await db.from('products').update({ visible: !p.visible }).eq('id', p.id);
    if (error) return msg('No se pudo cambiar la visibilidad: ' + error.message, true);
    msg(p.visible ? 'Producto oculto en la tienda.' : 'Producto visible en la tienda.');
    load();
  } else if (b.dataset.del) {
    const p = products.find(x => x.id == b.dataset.del);
    if (!p || !confirm(`¿Eliminar "${p.name}"?`)) return;
    const { error } = await db.from('products').delete().eq('id', p.id);
    if (error) return msg('No se pudo eliminar: ' + error.message, true);
    await removeImage(p.pic);
    if (editing === p.id) resetForm();
    msg('Producto eliminado.');
    load();
  } else if (b.dataset.edit) {
    const p = products.find(x => x.id == b.dataset.edit); if (!p) return;
    editing = p.id;
    $('#form').reset();
    $('#name').value = p.name; $('#price').value = p.price; $('#category').value = p.category;
    $('#desc').value = p.description;
    $('#stock').value = p.stock ?? '';
    $('#visible').checked = p.visible;
    $('#pic').required = false;
    $('#picHint').textContent = 'Deja este campo vacío para conservar la imagen actual.';
    setPreview(p.pic);
    $('#formTitle').textContent = 'Editar producto';
    $('#saveBtn').textContent = 'Guardar cambios';
    $('#cancelBtn').hidden = false;
    $('#name').focus();
  }
});


// ---------- Pestañas ----------
function showTab(t) {
  ['productos', 'ingresos', 'pedidos', 'pagina'].forEach(n => {
    $('#tab-' + n).hidden = n !== t;
    document.querySelector(`[data-tab="${n}"]`).classList.toggle('on', n === t);
  });
  if (t === 'ingresos') loadSales();
  if (t === 'pedidos') loadOrders();
  if (t === 'pagina') loadSettings();
}

document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});

// ---------- Ingresos ----------
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const compact = n => n ? '$' + new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '';

const TYPES = {
  day:       { n: 14, now: 'Hoy',           prev: 'ayer',               title: 'Ingresos por día (últimos 14 días)' },
  week:      { n: 12, now: 'Esta semana',   prev: 'la semana pasada',   title: 'Ingresos por semana (lunes a domingo, últimas 12)' },
  fortnight: { n: 12, now: 'Esta quincena', prev: 'la quincena pasada', title: 'Ingresos por quincena (1–15 y 16–fin de mes, últimas 12)' },
  month:     { n: 12, now: 'Este mes',      prev: 'el mes pasado',      title: 'Ingresos por mes (últimos 12)' }
};

function labelOf(type, s, e) {
  const a = `${s.getDate()} ${MES[s.getMonth()]}`, b = `${e.getDate()} ${MES[e.getMonth()]}`;
  if (type === 'day') return a;
  if (type === 'month') return `${MES[s.getMonth()]} ${s.getFullYear()}`;
  return s.getMonth() === e.getMonth() ? `${s.getDate()}–${b}` : `${a} – ${b}`;
}

function periodOf(type, d) {
  const y = d.getFullYear(), m = d.getMonth();
  let s, e;
  if (type === 'day') { s = e = d; }
  else if (type === 'week') { s = new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7)); e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); }
  else if (type === 'fortnight') {
    if (d.getDate() <= 15) { s = new Date(y, m, 1); e = new Date(y, m, 15); }
    else { s = new Date(y, m, 16); e = new Date(y, m + 1, 0); }
  } else { s = new Date(y, m, 1); e = new Date(y, m + 1, 0); }
  return { key: fmt(s), start: s, label: labelOf(type, s, e) };
}

// Una fecha cualquiera dentro del periodo anterior al que empieza en `s`
function before(type, s) {
  const y = s.getFullYear(), m = s.getMonth(), d = s.getDate();
  if (type === 'day') return new Date(y, m, d - 1);
  if (type === 'week') return new Date(y, m, d - 7);
  if (type === 'fortnight') return d === 1 ? new Date(y, m - 1, 16) : new Date(y, m, 1);
  return new Date(y, m - 1, 1);
}

async function loadSales() {
  const now = new Date();
  const since = fmt(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await db.from('sales').select('*').gte('sold_at', since)
      .order('sold_at', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
    if (error) return msg('No se pudieron cargar las ventas: ' + error.message, true);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  sales = all;
  renderIncome();
}

function renderIncome() {
  const cfg = TYPES[ptype];
  let p = periodOf(ptype, new Date());
  const list = [p];
  for (let i = 1; i < cfg.n; i++) { p = periodOf(ptype, before(ptype, p.start)); list.push(p); }

  const tot = {}, cnt = {};
  sales.forEach(s => {
    const k = periodOf(ptype, parse(s.sold_at)).key;
    tot[k] = (tot[k] || 0) + s.amount;
    cnt[k] = (cnt[k] || 0) + 1;
  });
  const rows = list.map(r => ({ ...r, total: tot[r.key] || 0, count: cnt[r.key] || 0 }));
  const cur = rows[0], prv = rows[1], max = Math.max(...rows.map(r => r.total), 1);
  const change = prv.total ? Math.round((cur.total - prv.total) / prv.total * 100) : null;

  $('#kpis').innerHTML =
    `<div class="kpi"><small>${cfg.now}</small><b>${money(cur.total)}</b></div>` +
    `<div class="kpi"><small>Ventas</small><b>${cur.count}</b></div>` +
    `<div class="kpi"><small>Frente a ${cfg.prev}</small><b>${change === null ? '—' : (change > 0 ? '+' : change < 0 ? '−' : '') + Math.abs(change) + ' %'}</b></div>`;

  $('#chartTitle').textContent = cfg.title;
  $('#bars').innerHTML = rows.slice().reverse().map((r, i, a) =>
    `<div class="col${i === a.length - 1 ? ' cur' : ''}"><span class="v">${compact(r.total)}</span><div class="track"><i style="height:${r.total ? Math.max(2, r.total / max * 100) : 0}%"></i></div><small>${r.label}</small></div>`).join('');
  $('#bars').scrollLeft = $('#bars').scrollWidth;

  $('#periodRows').innerHTML = rows.map(r => `<tr><td>${r.label}</td><td>${r.count}</td><td>${money(r.total)}</td></tr>`).join('');

  $('#saleRows').innerHTML = sales.slice(0, 20).map(s =>
    `<tr><td>${s.sold_at}</td><td>${esc(s.product_name)}${s.note ? `<br><small>${esc(s.note)}</small>` : ''}</td><td>${s.quantity}</td><td>${money(s.amount)}</td><td><button class="del" data-sale="${s.id}">Eliminar</button></td></tr>`).join('')
    || '<tr><td colspan="5">Aún no hay ventas registradas. Registra la primera desde el formulario.</td></tr>';
}

$('#seg').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  ptype = b.dataset.p;
  document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
  renderIncome();
});

// ---------- Registrar / eliminar ventas ----------
function renderSaleOptions() {
  const sel = $('#saleProduct'), old = sel.value;
  sel.innerHTML = products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '<option value="custom">Otro producto…</option>';
  if (old && [...sel.options].some(o => o.value === old)) sel.value = old;
  syncSale();
}

function syncSale() {
  const custom = $('#saleProduct').value === 'custom';
  $('#saleCustomWrap').hidden = !custom;
  $('#saleCustom').required = custom;
  if (!custom) {
    const p = products.find(x => x.id == $('#saleProduct').value);
    if (p) $('#saleAmount').value = p.price * (Number($('#saleQty').value) || 1);
  }
}

$('#saleProduct').addEventListener('change', syncSale);
$('#saleQty').addEventListener('input', syncSale);

$('#saleForm').addEventListener('submit', async e => {
  e.preventDefault();
  msg('');
  const p = products.find(x => x.id == $('#saleProduct').value);
  const row = {
    sold_at: $('#saleDate').value,
    product_id: p ? p.id : null,
    product_name: p ? p.name : $('#saleCustom').value.trim(),
    quantity: Math.round(Number($('#saleQty').value)),
    amount: Math.round(Number($('#saleAmount').value)),
    note: $('#saleNote').value.trim()
  };
  $('#saleBtn').disabled = true;
  const { error } = await db.from('sales').insert(row);
  $('#saleBtn').disabled = false;
  if (error) return msg('No se pudo registrar la venta: ' + error.message, true);
  msg('Venta registrada.');
  $('#saleNote').value = ''; $('#saleCustom').value = ''; $('#saleQty').value = 1;
  syncSale();
  loadSales();
});

$('#saleRows').addEventListener('click', async e => {
  const b = e.target.closest('[data-sale]'); if (!b) return;
  const s = sales.find(x => x.id == b.dataset.sale);
  if (!s || !confirm(`¿Eliminar la venta de "${s.product_name}" por ${money(s.amount)}?`)) return;
  const { error } = await db.from('sales').delete().eq('id', s.id);
  if (error) return msg('No se pudo eliminar: ' + error.message, true);
  msg('Venta eliminada.');
  loadSales();
});


// ---------- Pedidos ----------
const STATUS = [['nuevo','Nuevo'],['pagado','Pagado'],['preparando','Preparando'],['enviado','Enviado'],['entregado','Entregado'],['cancelado','Cancelado']];
const AFTER_PAY = ['preparando', 'enviado', 'entregado']; // solo se pueden usar después de confirmar el pago
const waPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '57' + d : d; };

async function loadOrders() {
  const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) return msg('No se pudieron cargar los pedidos: ' + error.message, true);
  orders = data;
  renderOrders();
}

function orderCard(o) {
  const when = new Date(o.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  const day = parse(o.delivery_date).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const hi = `Hola ${o.customer_name}, te escribimos por tu pedido #${o.id}.`;
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
  return `<article class="order st-${o.status}">
    <header><b>Pedido #${o.id}</b><small>${when}</small>
      <select data-status="${o.id}" aria-label="Estado del pedido" ${o.status === 'cancelado' ? 'disabled' : ''}>${STATUS.map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></header>
    <ul>${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></li>`).join('')}</ul>
    <p class="tot">Total de productos <b>${money(o.total)}</b></p>
    <dl>${row('Cliente', `${o.customer_name} (${o.customer_phone})`)}${row('Recibe', o.recipient_name + (o.recipient_phone ? ` (${o.recipient_phone})` : ''))}${row('Dirección', o.address)}${row('Entrega', `${day}, ${o.delivery_time}`)}${row('Dedicatoria', o.dedication)}${o.anonymous ? row('Remitente', 'Sin nombre (sorpresa)') : ''}${row('Indicaciones', o.notes)}</dl>
    <div class="oact"><a class="btnlink" target="_blank" rel="noopener" href="https://wa.me/${waPhone(o.customer_phone)}?text=${encodeURIComponent(hi)}">Escribir al cliente</a><button class="del" data-delorder="${o.id}">Eliminar</button></div>
  </article>`;
}

function renderOrders() {
  const nuevos = orders.filter(o => o.status === 'nuevo').length;
  $('#newBadge').textContent = nuevos ? ` (${nuevos})` : '';
  $('#ofilter').innerHTML = [['todos', 'Todos'], ...STATUS].map(([k, l]) =>
    `<button type="button" data-o="${k}" class="${k === ofilter ? 'on' : ''}">${l} ${k === 'todos' ? orders.length : orders.filter(o => o.status === k).length}</button>`).join('');
  const list = orders.filter(o => ofilter === 'todos' || o.status === ofilter);
  $('#orderList').innerHTML = list.map(orderCard).join('') || '<p class="hint">No hay pedidos en esta lista.</p>';
}

$('#ofilter').addEventListener('click', e => {
  const b = e.target.closest('[data-o]'); if (!b) return;
  ofilter = b.dataset.o; renderOrders();
});

async function setStatus(id, status) {
  const o = orders.find(x => x.id == id); if (!o) return;
  const label = STATUS.find(x => x[0] === status)[1];

  // No se puede preparar, enviar ni entregar un pedido sin confirmar el pago primero
  if (AFTER_PAY.includes(status) && o.status === 'nuevo') {
    msg('Primero marca el pedido como "Pagado" cuando confirmes el pago.', true);
    return renderOrders();
  }
  if (status === 'cancelado' && !confirm('Cancelar el pedido devuelve el stock a los productos y quita su ingreso. Esta acción no se puede deshacer. ¿Continuar?')) return renderOrders();

  const { error } = await db.from('orders').update({ status }).eq('id', id);
  if (error) { msg('No se pudo cambiar el estado: ' + error.message, true); return loadOrders(); }

  if (status === 'pagado') {
    // El ingreso se registra SOLO al confirmar el pago, y una sola vez por pedido
    const { data: ya, error: qErr } = await db.from('sales').select('id').eq('order_id', o.id).limit(1);
    if (qErr) {
      msg(`Estado cambiado, pero no se pudo verificar el ingreso: ${qErr.message}`, true);
    } else if (!ya.length) {
      const { error: sErr } = await db.from('sales').insert({
        sold_at: fmt(new Date()), product_id: null,
        product_name: o.items.map(i => `${i.qty} x ${i.name}`).join(', '),
        quantity: o.items.reduce((n, i) => n + i.qty, 0), amount: o.total, note: `Pedido #${o.id}`, order_id: o.id
      });
      if (sErr && sErr.code !== '23505') msg(`Estado cambiado, pero no se pudo registrar el ingreso: ${sErr.message}`, true);
      else msg(`Pedido #${id}: ${label}. Ingreso registrado.`);
    } else msg(`Pedido #${id}: ${label}.`);
  } else if (status === 'nuevo' || status === 'cancelado') {
    // Sin pago confirmado (o cancelado) no debe quedar ingreso
    const { error: dErr } = await db.from('sales').delete().eq('order_id', id);
    if (dErr) msg(`Estado cambiado, pero no se pudo quitar el ingreso: ${dErr.message}`, true);
    else msg(status === 'cancelado' ? `Pedido #${id} cancelado y stock devuelto.` : `Pedido #${id}: ${label}. Se quitó su ingreso.`);
  } else msg(`Pedido #${id}: ${label}.`); // preparando / enviado / entregado: el ingreso ya se registró al pagar

  loadOrders(); load();
}

$('#orderList').addEventListener('change', e => {
  const s = e.target.closest('[data-status]'); if (s) setStatus(s.dataset.status, s.value);
});

$('#orderList').addEventListener('click', async e => {
  const b = e.target.closest('[data-delorder]'); if (!b) return;
  if (!confirm(`¿Eliminar el pedido #${b.dataset.delorder}? No devuelve el stock; si no se entregó, mejor cámbialo a "Cancelado".`)) return;
  const { error } = await db.from('orders').delete().eq('id', b.dataset.delorder);
  if (error) return msg('No se pudo eliminar: ' + error.message, true);
  msg('Pedido eliminado.'); loadOrders();
});


// ---------- Personalización de la página ----------
const SITE_DEFAULTS = {
  store_name: 'Lazo', whatsapp: '573000000000',
  hero_title: 'Regalos que dicen lo que no sabes decir.',
  hero_text: 'Cajas sorpresa, desayunos, flores y detalles para cumpleaños, aniversarios y cualquier día que valga la pena celebrar.',
  hero_tag: 'Pedidos\npor WhatsApp',
  footer_title: '¿Algo a tu medida?', footer_text: 'Escríbenos y armamos el regalo con lo que necesites.',
  color_ribbon: '#e0245e', color_ink: '#1b2142', color_sun: '#f5c542', color_paper: '#e3f2ea',
  instagram: '', location_text: '', location_url: '',
  how_text: "Elige | Escoge tu regalo en el catálogo y agrégalo al carrito.\nCuéntanos los datos | Indica quién lo recibe, la dirección, la fecha y la dedicatoria.\nConfirma el pago | Te escribimos por WhatsApp para confirmar el domicilio y el pago.\nLo entregamos | Llevamos el regalo en la fecha y el horario que elegiste.",
  faq_text: "¿Cuánto cuesta el domicilio? | Lo confirmamos por WhatsApp antes de que pagues.\n¿Cómo puedo pagar? | Al enviar tu pedido te escribimos por WhatsApp con las opciones de pago.\n¿Con cuánta anticipación debo pedir? | Elige la fecha en el formulario. Si es para hoy o para una fecha especial, escríbenos para confirmar disponibilidad.\n¿Puedo enviarlo como sorpresa? | Sí, marca la opción \"Enviar sin mi nombre\" y no diremos quién lo envía.\n¿Qué pasa si nadie puede recibirlo? | Te avisamos para coordinar otra hora o dejarlo en la portería.",
  max_orders_per_day: '', low_stock: '3'
};
const SITE_KEEP = ['whatsapp', 'instagram', 'location_text', 'location_url', 'max_orders_per_day', 'low_stock']; // Restablecer no los toca
const SITE_KEYS = Object.keys(SITE_DEFAULTS);
const siteEl = k => $('#s_' + k);

async function loadSettings() {
  const { data, error } = await db.from('site_settings').select('key,value');
  if (error) return msg('No se pudo cargar la personalización: ' + error.message, true);
  const saved = Object.fromEntries(data.map(r => [r.key, r.value]));
  SITE_KEYS.forEach(k => { siteEl(k).value = saved[k] || SITE_DEFAULTS[k]; });
  lowLimit = /^\d+$/.test(saved.low_stock || '') ? Number(saved.low_stock) : 3;
  if (products.length) render();
}

$('#siteForm').addEventListener('submit', async e => {
  e.preventDefault();
  msg('');
  const vals = Object.fromEntries(SITE_KEYS.map(k => [k, siteEl(k).value.trim()]));
  vals.whatsapp = waPhone(vals.whatsapp);
  if (!/^\d{11,15}$/.test(vals.whatsapp)) return msg('El WhatsApp debe incluir el indicativo del país, por ejemplo 573001234567.', true);
  if (vals.location_url && !/^https:\/\//i.test(vals.location_url)) return msg('El enlace del mapa debe empezar con https://', true);
  if (vals.max_orders_per_day && !/^\d{1,3}$/.test(vals.max_orders_per_day)) return msg('El máximo de pedidos debe ser un número (vacío = sin límite).', true);
  if (!/^\d{1,3}$/.test(vals.low_stock)) return msg('El aviso de stock bajo debe ser un número.', true);
  siteEl('whatsapp').value = vals.whatsapp;
  $('#siteBtn').disabled = true;
  const { error } = await db.from('site_settings').upsert(SITE_KEYS.map(k => ({ key: k, value: vals[k] })), { onConflict: 'key' });
  $('#siteBtn').disabled = false;
  if (error) return msg('No se pudo guardar: ' + error.message, true);
  msg('Personalización guardada. Ya se ve en la tienda.');
  lowLimit = Number(vals.low_stock); render();
});

$('#siteReset').addEventListener('click', async () => {
  if (!confirm('¿Volver a los textos y colores originales? El WhatsApp, Instagram, ubicación y límites no cambian.')) return;
  const { error } = await db.from('site_settings').delete().in('key', SITE_KEYS.filter(k => !SITE_KEEP.includes(k)));
  if (error) return msg('No se pudo restablecer: ' + error.message, true);
  msg('Textos y colores restablecidos.');
  loadSettings();
});
