const SUPABASE_URL = 'https://exxnlurtgorxdditbrak.supabase.co';
const SUPABASE_KEY = 'sb_publishable_d4jrBZ2orxTW0TTYvB3xQg_NplhbrYL'; // clave pública: segura en el navegador gracias a RLS
let WA = '573000000000'; // se cambia desde el panel (pestaña Página)

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n).toLocaleString('es-CO');
const thumb = v => /^(https?:|data:)/.test(v) ? `<img src="${esc(v)}" alt="">` : esc(v || '🎁');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const niceDate = s => s.split('-').reverse().join('/');
const maxQty = p => p.stock == null ? 50 : p.stock; // stock vacío = sin control

let products = [], cart = {}, cat = 'Todos';

async function load() {
  $('#grid').innerHTML = '<p class="vacio">Cargando regalos…</p>';
  const { data, error } = await db.from('products').select('*').order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    $('#grid').innerHTML = '<p class="vacio">No pudimos cargar el catálogo. Recarga la página e inténtalo de nuevo.</p>';
    return;
  }
  products = data;
  Object.keys(cart).forEach(id => { // ajusta el carrito a lo que realmente hay
    const p = products.find(x => x.id == id), m = p ? maxQty(p) : 0;
    if (m <= 0) delete cart[id]; else if (cart[id] > m) cart[id] = m;
  });
  if (cat !== 'Todos' && !products.some(p => p.category === cat)) cat = 'Todos';
  renderFilters(); renderGrid(); renderCart();
}

function renderFilters() {
  const cats = ['Todos', ...new Set(products.map(p => p.category))];
  $('#filters').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}

function renderGrid() {
  const list = products.filter(p => cat === 'Todos' || p.category === cat);
  $('#grid').innerHTML = list.length
    ? list.map(p => {
        const out = p.stock === 0, low = p.stock != null && p.stock > 0 && p.stock <= 3;
        return `<article class="card${out ? ' out' : ''}"><div class="pic">${thumb(p.pic)}</div><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>${low ? `<em class="low">Quedan ${p.stock}</em>` : ''}<div class="row"><b>${money(p.price)}</b>${out ? '<span class="tagout">Agotado</span>' : `<button class="btn sm" data-add="${p.id}">Agregar</button>`}</div></article>`;
      }).join('')
    : '<p class="vacio">Pronto tendremos nuevos regalos en esta categoría.</p>';
}

function cartItems() {
  return Object.entries(cart).map(([id, q]) => ({ p: products.find(x => x.id == id), q })).filter(i => i.p);
}

function renderCart() {
  const items = cartItems();
  const total = items.reduce((s, i) => s + i.p.price * i.q, 0);
  $('#cartCount').textContent = items.reduce((s, i) => s + i.q, 0);
  $('#cartItems').innerHTML = items.length
    ? items.map(({ p, q }) => `<li><span class="ci">${thumb(p.pic)}</span><div><b>${esc(p.name)}</b><small>${money(p.price)}</small></div><div class="qty"><button data-dec="${p.id}" aria-label="Quitar uno">−</button><span>${q}</span><button data-inc="${p.id}" aria-label="Agregar uno" ${q >= maxQty(p) ? 'disabled' : ''}>+</button></div></li>`).join('')
    : '<li class="empty">Tu carrito está vacío. Elige un regalo del catálogo.</li>';
  $('#cartTotal').textContent = $('#orderTotal').textContent = money(total);
  $('#toOrder').disabled = !items.length;
}

// ---------- Vistas del panel: carrito / datos del pedido / confirmación ----------
function showView(v) {
  ['cartView', 'orderForm', 'doneView'].forEach(id => { $('#' + id).hidden = id !== v; });
  $('#cartTitle').textContent = { cartView: 'Tu carrito', orderForm: 'Datos del pedido', doneView: 'Pedido enviado' }[v];
  if (v === 'orderForm') { $('#orderForm').elements.delivery_date.min = today(); orderMsg(''); }
}
const setCart = open => { $('#cart').classList.toggle('open', open); if (open && !$('#doneView').hidden) showView('cartView'); };
function orderMsg(text) { const m = $('#orderMsg'); m.textContent = text; m.hidden = !text; }

document.addEventListener('click', e => {
  const t = e.target.closest('[data-c],[data-add],[data-inc],[data-dec],#cartBtn,#closeCart,#toOrder,#backCart,#doneClose');
  if (!t) return;
  const d = t.dataset, id = d.add || d.inc;
  if (d.c) { cat = d.c; renderFilters(); renderGrid(); }
  else if (id) {
    const p = products.find(x => x.id == id);
    if (p && (cart[id] || 0) < maxQty(p)) cart[id] = (cart[id] || 0) + 1;
    renderCart(); if (d.add) setCart(true);
  }
  else if (d.dec) { if (--cart[d.dec] <= 0) delete cart[d.dec]; renderCart(); }
  else if (t.id === 'toOrder') showView('orderForm');
  else if (t.id === 'backCart') showView('cartView');
  else if (t.id === 'doneClose') { showView('cartView'); setCart(false); }
  else setCart(t.id === 'cartBtn');
});

// ---------- Enviar pedido: se guarda en Supabase y se abre WhatsApp ----------
$('#orderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target), g = k => (f.get(k) || '').toString().trim();
  const items = cartItems();
  if (!items.length) return showView('cartView');
  orderMsg('');
  $('#orderBtn').disabled = true;
  const { data, error } = await db.rpc('place_order', {
    p_customer_name: g('customer_name'), p_customer_phone: g('customer_phone'),
    p_recipient_name: g('recipient_name'), p_recipient_phone: g('recipient_phone'),
    p_address: g('address'), p_delivery_date: g('delivery_date'), p_delivery_time: g('delivery_time'),
    p_dedication: g('dedication'), p_anonymous: f.get('anonymous') === 'on', p_notes: g('notes'),
    p_items: items.map(i => ({ id: i.p.id, qty: i.q }))
  });
  $('#orderBtn').disabled = false;

  if (error) {
    console.error(error);
    orderMsg(error.code === 'P0001' ? error.message : 'No pudimos registrar el pedido. Inténtalo de nuevo en un momento.');
    await load(); // refresca stock y productos disponibles
    if (!cartItems().length) showView('cartView');
    return;
  }

  const text = [
    `*Pedido #${data.id}* 🎁`, '',
    ...items.map(i => `• ${i.q} x ${i.p.name} (${money(i.p.price * i.q)})`),
    `Productos: ${money(data.total)} (sin domicilio)`, '',
    `*Quién pide:* ${g('customer_name')} (${g('customer_phone')})`,
    `*Para:* ${g('recipient_name')}${g('recipient_phone') ? ' (' + g('recipient_phone') + ')' : ''}`,
    `*Dirección:* ${g('address')}`,
    `*Entrega:* ${niceDate(g('delivery_date'))}, ${g('delivery_time')}`,
    ...(g('dedication') ? [`*Dedicatoria:* ${g('dedication')}`] : []),
    ...(f.get('anonymous') === 'on' ? ['*Enviar sin mi nombre (sorpresa)*'] : []),
    ...(g('notes') ? [`*Indicaciones:* ${g('notes')}`] : [])
  ].join('\n');
  const url = `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;

  cart = {}; e.target.reset(); renderCart(); load();
  $('#doneText').textContent = `Tu pedido #${data.id} quedó registrado por ${money(data.total)}. Envíalo por WhatsApp para confirmar el domicilio y el pago.`;
  $('#waBtn').href = url;
  showView('doneView');
  window.open(url, '_blank'); // si el navegador lo bloquea, queda el botón "Abrir WhatsApp"
});

// ---------- Personalización (se edita en el panel admin, pestaña Página) ----------
const HEX = /^#[0-9a-f]{6}$/i;
function applySettings(s) {
  const text = (sel, k, fn) => { const el = $(sel); if (el && s[k]) fn ? fn(el, s[k]) : (el.textContent = s[k]); };
  text('.logo', 'store_name');
  if (s.store_name) document.title = `${s.store_name} — Tienda de regalos`;
  text('.hero h1', 'hero_title');
  text('.hero p', 'hero_text');
  text('.hero-tag', 'hero_tag', (el, v) => el.replaceChildren(...v.split('\n').flatMap((l, i) => i ? [document.createElement('br'), l.trim()] : [l.trim()])));
  text('footer h2', 'footer_title');
  text('footer p', 'footer_text');
  if (/^\d{11,15}$/.test(s.whatsapp || '')) {
    WA = s.whatsapp;
    const a = $('footer .btn.light'); if (a) a.href = `https://wa.me/${WA}`;
  }
  const root = document.documentElement.style;
  [['ribbon', 'color_ribbon'], ['ink', 'color_ink'], ['sun', 'color_sun'], ['paper', 'color_paper']]
    .forEach(([v, k]) => { if (HEX.test(s[k] || '')) root.setProperty('--' + v, s[k]); });
  if (HEX.test(s.color_ribbon || '')) root.setProperty('--sheen', `color-mix(in srgb, ${s.color_ribbon} 70%, white)`);
  renderInfo(s);
}

// ---------- Cómo funciona, preguntas frecuentes, Instagram y ubicación ----------
const HOW_DEFAULT = "Elige | Escoge tu regalo en el catálogo y agrégalo al carrito.\nCuéntanos los datos | Indica quién lo recibe, la dirección, la fecha y la dedicatoria.\nConfirma el pago | Te escribimos por WhatsApp para confirmar el domicilio y el pago.\nLo entregamos | Llevamos el regalo en la fecha y el horario que elegiste.";
const FAQ_DEFAULT = "¿Cuánto cuesta el domicilio? | Lo confirmamos por WhatsApp antes de que pagues.\n¿Cómo puedo pagar? | Al enviar tu pedido te escribimos por WhatsApp con las opciones de pago.\n¿Con cuánta anticipación debo pedir? | Elige la fecha en el formulario. Si es para hoy o para una fecha especial, escríbenos para confirmar disponibilidad.\n¿Puedo enviarlo como sorpresa? | Sí, marca la opción \"Enviar sin mi nombre\" y no diremos quién lo envía.\n¿Qué pasa si nadie puede recibirlo? | Te avisamos para coordinar otra hora o dejarlo en la portería.";
const pairs = t => String(t).split('\n').map(l => l.split('|')).map(([a, ...r]) => [a.trim(), r.join('|').trim()]).filter(([a, b]) => a && b);
const mk = (tag, text, href) => { const el = document.createElement(tag); el.textContent = text; if (href) Object.assign(el, { href, target: '_blank', rel: 'noopener' }); return el; };

function renderInfo(s) {
  const how = pairs(s.how_text || HOW_DEFAULT), faq = pairs(s.faq_text || FAQ_DEFAULT);
  $('#howList').innerHTML = how.map(([t, d], i) => `<li><span class="n">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`).join('');
  $('#faqList').innerHTML = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  $('#como').hidden = !how.length; $('#faq').hidden = !faq.length;
  const ig = String(s.instagram || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop().replace(/^@/, '');
  const info = [];
  if (/^[A-Za-z0-9._]{1,30}$/.test(ig)) info.push(mk('a', `Instagram @${ig}`, `https://instagram.com/${ig}`));
  if (s.location_text) info.push(mk('span', s.location_text));
  if (/^https:\/\//i.test(s.location_url || '')) info.push(mk('a', 'Ver en el mapa', s.location_url));
  $('#footInfo').replaceChildren(...info);
}

let siteCache = {};
try { siteCache = JSON.parse(localStorage.getItem('lazo_site') || '{}'); } catch {} // evita el parpadeo en visitas repetidas
applySettings(siteCache);
db.from('site_settings').select('key,value').then(({ data, error }) => {
  if (error || !data) return;
  const s = Object.fromEntries(data.map(r => [r.key, r.value]));
  applySettings(s);
  try { localStorage.setItem('lazo_site', JSON.stringify(s)); } catch {}
});

renderCart();
load();
