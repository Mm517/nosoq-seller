/* ==========================================================================
   js/seller.js — لوحة البائع: الهيكل، الراوتر، إنشاء المتجر، لوحة التحكم، الإحصائيات
   (المنتجات والطلبات في seller-products.js، والمحفظة والإعلانات والدعم والإعدادات في seller-money.js)
   الراوتر بالـ hash: #/dashboard #/products #/orders #/stats #/wallet #/ads #/support #/settings
   ========================================================================== */
(function () {
  'use strict';
  if (document.body.dataset.page !== 'seller-dash') return;

  const M = window.Market, U = window.UI, CFG = window.Store.config, C = window.Charts;
  const esc = window.Store.esc, money = window.Store.money;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ic = U.icon;

  /* ---------- أدوات مشتركة بين ملفات اللوحة ---------- */
  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const F_DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
  const F_SHORT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' });
  const F_DOW = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'short' });
  const F_TIME = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
  const dateAr = (iso) => F_DATE.format(new Date(iso));
  const dateTimeAr = (iso) => F_DATE.format(new Date(iso)) + '، ' + F_TIME.format(new Date(iso));
  const shortKey = (k) => F_SHORT.format(M.util.parseKey(k));
  const dowKey = (k) => F_DOW.format(M.util.parseKey(k));

  const STATUS_CLS = { new: 'new', accepted: 'processing', preparing: 'processing', ready: 'shipped', out_for_delivery: 'shipped', delivered: 'completed', cancelled: 'cancelled', returned: 'cancelled', processing: 'processing', shipped: 'shipped', completed: 'completed' };
  const pill = (status, label) => '<span class="pill pill--' + (STATUS_CLS[status] || 'new') + '">' + esc(label || M.STATUS[status] || status) + '</span>';
  function growth(g) {
    const cls = g > 0 ? 'up' : g < 0 ? 'down' : 'flat';
    return '<span class="growth growth--' + cls + '" title="مقارنة بالفترة السابقة"><span aria-hidden="true">' + (g > 0 ? '▲' : g < 0 ? '▼' : '–') + '</span>' + Math.abs(g) + '%<span class="sr-only">' + (g > 0 ? ' زيادة' : g < 0 ? ' انخفاض' : ' بلا تغيير') + '</span></span>';
  }
  /* صورة منتج (بائع أو كتالوج) مع بديل لو المنتج غير منشور */
  function pimg(p, cls) {
    const c = cls || 'pthumb', live = window.Products.byId(p.id);
    if (p.photos && /^data:image\//.test(p.photos[0] || '')) return '<img class="' + c + '" src="' + esc(p.photos[0]) + '" alt="" width="48" height="60">';
    if (live) return '<img class="' + c + '"' + window.Products.imgAttrs(live, 0, 0, 'xs') + ' alt="" width="48" height="60" loading="lazy">';
    return '<span class="' + c + ' pthumb--ph">' + ic('box') + '</span>';
  }
  const empty = (o) => '<div class="dempty">' + ic(o.icon || 'box') + '<h3>' + esc(o.title) + '</h3>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
    (o.action ? '<a class="btn btn--primary btn--sm" href="' + o.action.href + '">' + esc(o.action.label) + '</a>' : '') + '</div>';
  const card = (title, body, o) => '<section class="dcard' + (o && o.cls ? ' ' + o.cls : '') + '"' + (o && o.id ? ' id="' + o.id + '"' : '') + '>' +
    (title ? '<div class="dcard__head"><h2>' + title + '</h2>' + ((o && o.tools) || '') + '</div>' : '') + body + '</section>';
  const pageHead = (title, sub, tools) => '<div class="dhead"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (tools ? '<div class="dhead__tools">' + tools + '</div>' : '') + '</div>';

  /* زر يحتاج تأكيداً (بدل confirm()): أول نقرة تُسلّحه، الثانية تنفّذ */
  function armed(btn, label) {
    if (btn.dataset.armed) { delete btn.dataset.armed; return true; }
    btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label || 'اضغط للتأكيد';
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3500);
    return false;
  }
  const csv = (rows, name) => {
    const body = rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const range = () => { const r = Number(sessionStorage.getItem('nq_range')); return [7, 30, 90].includes(r) ? r : 30; };
  const rangeSelect = () => '<label class="sr-only" for="range-sel">الفترة</label><select class="select select--sm" id="range-sel" data-range>' +
    [7, 30, 90].map((d) => '<option value="' + d + '"' + (range() === d ? ' selected' : '') + '>آخر ' + d + ' يوماً</option>').join('') + '</select>';

  const Seller = window.Seller = { views: {}, actions: {}, M, U, esc, money, fmt, ic, $, $$, dateAr, dateTimeAr, shortKey, dowKey, pill, growth, pimg, empty, card, pageHead, armed, csv, range, rangeSelect, STATUS_CLS };
  Seller.go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  Seller.rerender = () => render();
  Seller.toast = (t, type) => U.toast(t, type ? { type } : undefined);

  /* ---------- الهيكل ---------- */
  const NAV = [
    ['عام', [['dashboard', 'grid', 'لوحة التحكم'], ['products', 'box', 'المنتجات'], ['orders', 'list', 'الطلبات'], ['stats', 'chart', 'الإحصائيات'], ['wallet', 'cash', 'الأرباح والمحفظة'], ['ads', 'megaphone', 'الإعلانات'], ['coupons', 'tag', 'الكوبونات']]],
    ['الحساب', [['support', 'chat', 'الدعم'], ['settings', 'gear', 'إعدادات المتجر']]]
  ];
  const root = $('#dash-root');

  function shell() {
    const s = M.seller.get();
    root.innerHTML =
      '<div class="dash" id="dash">' +
        '<div class="dash__scrim" data-act="nav-close"></div>' +
        '<aside class="dash__side" id="dash-side" aria-label="قائمة لوحة البائع">' +
          '<a class="dash__logo notranslate" translate="no" href="' + NasaqLinks.url('main', '/') + '">نَسَق<small>مركز البائعين</small></a>' +
          '<nav class="dash__nav" aria-label="أقسام لوحة البائع">' + NAV.map((g) =>
            '<p class="dash__group">' + g[0] + '</p>' + g[1].map((n) =>
              '<a href="#/' + n[0] + '" data-nav="' + n[0] + '">' + ic(n[1]) + '<span>' + n[2] + '</span>' + (n[0] === 'orders' ? '<span class="dash__count" data-orders-count hidden></span>' : '') + '</a>').join('')).join('') + '</nav>' +
          '<div class="dash__foot">' +
            '<a href="' + NasaqLinks.url('main', '/') + '">' + ic('store') + 'العودة للمتجر</a>' +
            '<a href="' + NasaqLinks.url('main', '/store/' + encodeURIComponent(s.slug)) + '" target="_blank" rel="noopener">' + ic('external') + 'صفحة متجري</a>' +
            '<div class="theme"><span>' + ic('sun') + 'المظهر</span>' +
              '<button type="button" class="switch" role="switch" aria-checked="false" data-act="theme" aria-label="الوضع الداكن"><span class="switch__i">' + ic('sun') + '</span><span class="switch__i">' + ic('moon') + '</span></button></div>' +
          '</div>' +
        '</aside>' +
        '<div class="dash__main">' +
          '<header class="dash__top">' +
            '<button type="button" class="icon-btn dash__burger" data-act="nav-open" aria-label="فتح القائمة" aria-controls="dash-side">' + ic('menu') + '</button>' +
            '<p class="dash__hi">أهلاً، <strong>' + esc(s.name) + '</strong></p>' +
            '<form class="dash__search" role="search" data-search><label class="sr-only" for="dash-q">بحث</label>' + ic('search') +
              '<input id="dash-q" class="input" type="search" placeholder="ابحث في المنتجات أو الطلبات…" autocomplete="off"></form>' +
            '<div class="dash__tools">' +
              '<div class="bell"><button type="button" class="icon-btn bell__btn" data-act="bell" aria-haspopup="true" aria-expanded="false" aria-label="الإشعارات">' + ic('bell') + '<span class="count-badge" data-bell-count hidden>0</span></button>' +
                '<div class="bell__panel" data-bell-panel hidden></div></div>' +
              '<a class="dash__me" href="#/settings">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '<span class="dash__av">' + esc(s.name.trim().charAt(0)) + '</span>') +
                '<span class="dash__me-t"><strong>' + esc(s.name) + '</strong><small>حساب بائع</small></span></a>' +
            '</div>' +
          '</header>' +
          '<main class="dash__view" id="main" tabindex="-1"></main>' +
        '</div>' +
      '</div>';
    applyTheme();
  }

  function applyTheme() {
    let t = 'light';
    try { t = localStorage.getItem(M.K.theme) === 'dark' ? 'dark' : 'light'; } catch (_) { /* تجاهل */ }
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    const sw = $('[data-act="theme"]'); if (sw) sw.setAttribute('aria-checked', String(t === 'dark'));
  }
  Seller.applyTheme = applyTheme;

  function refreshChrome() {
    const n = M.orders.counts().new;
    const oc = $('[data-orders-count]'); if (oc) { oc.hidden = !n; oc.textContent = n; }
    const bc = $('[data-bell-count]'); const u = M.notifs.unread(); if (bc) { bc.hidden = !u; bc.textContent = u; }
    const cur = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'dashboard';
    $$('[data-nav]').forEach((a) => { if (a.dataset.nav === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  function bellHTML() {
    const list = M.notifs.list().slice(0, 8);
    return '<div class="bell__head"><strong>الإشعارات</strong>' + (list.length ? '<button type="button" class="link-btn" data-act="bell-read">تمييز الكل كمقروء</button>' : '') + '</div>' +
      (list.length ? '<ul>' + list.map((n) => '<li class="' + (n.read ? '' : 'is-unread') + '"><a href="' + esc(n.href || '#/dashboard') + '" data-act="bell-go" data-id="' + esc(n.id) + '"><strong>' + esc(n.title) + '</strong><span>' + esc(n.text || '') + '</span><small>' + dateTimeAr(n.date) + '</small></a></li>').join('') + '</ul>'
        : '<p class="bell__empty">لا توجد إشعارات بعد.</p>');
  }

  /* ---------- إنشاء المتجر (أول دخول) ---------- */
  let setupGeo = null, setupLogo = '';
  function setupView() {
    root.innerHTML =
      '<main class="setup" id="main" tabindex="-1"><div class="setup__card">' +
        '<a class="dash__logo dash__logo--dark notranslate" translate="no" href="' + NasaqLinks.url('main', '/') + '">نَسَق<small>مركز البائعين</small></a>' +
        '<h1>أنشئ متجرك وابدأ البيع</h1>' +
        '<p class="setup__lead">دقيقتان وتصبح جاهزاً: أضف بيانات متجرك، حدّد موقعك على الخريطة، ثم أضف منتجاتك. العمولة ' + Math.round(CFG.commission * 100) + '% فقط من كل عملية بيع.</p>' +
        '<form class="dform" id="setup-form" novalidate>' +
          '<div class="dform__row">' +
            fld('s-name', 'اسم المتجر *', '<input class="input" id="s-name" maxlength="40" autocomplete="off" required>') +
            fld('s-slug', 'رابط المتجر (إنجليزي) *', '<input class="input" id="s-slug" dir="ltr" maxlength="30" placeholder="my-store" autocomplete="off" required>', 'حروف إنجليزية صغيرة وأرقام وشرطة فقط') +
          '</div>' +
          '<div class="dform__row">' +
            fld('s-cat', 'نوع المنتجات *', '<select class="select" id="s-cat">' + window.Products.categories.map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join('') + '</select>') +
            fld('s-phone', 'رقم الجوال *', '<input class="input" id="s-phone" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" placeholder="01012345678" required>') +
          '</div>' +
          fld('s-email', 'البريد الإلكتروني *', '<input class="input" id="s-email" type="email" dir="ltr" autocomplete="email" required>') +
          fld('s-desc', 'نبذة عن المتجر', '<textarea class="textarea" id="s-desc" rows="3" maxlength="300" placeholder="ماذا تبيع؟ وما الذي يميّز متجرك؟"></textarea>') +
          '<div class="field"><span class="label">شعار المتجر (اختياري)</span><div class="logo-up"><span class="logo-up__pv" data-logo-pv>' + ic('store') + '</span>' +
            '<label class="btn btn--ghost btn--sm">' + ic('upload') + 'اختر صورة<input type="file" accept="image/*" data-logo hidden></label></div></div>' +
          '<div class="field"><span class="label">موقع المتجر (مصدر الشحن) *</span><div data-geo-root></div></div>' +
          '<label class="check"><input type="checkbox" id="s-terms" required> أوافق على شروط البائعين وعمولة المنصة (' + Math.round(CFG.commission * 100) + '%)</label>' +
          '<p class="field__error" id="setup-error" role="alert"></p>' +
          '<button class="btn btn--primary btn--lg" type="submit">افتح متجري</button>' +
        '</form></div></main>';
    setupGeo = window.Geo.mount($('[data-geo-root]'), {});
    setupLogo = '';
    const name = $('#s-name'), slug = $('#s-slug');
    let touched = false;
    slug.addEventListener('input', () => { touched = true; });
    name.addEventListener('input', () => {
      if (touched) return;
      const base = name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      slug.value = base;
    });
    $('[data-logo]').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { setupLogo = await M.image(f, { max: 256, q: 0.85 }); $('[data-logo-pv]').innerHTML = '<img src="' + setupLogo + '" alt="">'; } catch (err) { U.toast(err.message, { type: 'error' }); }
    });
    $('#setup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('#setup-error'), g = setupGeo.getValue();
      const v = { name: name.value.trim(), slug: slug.value.trim(), phone: $('#s-phone').value.trim(), email: $('#s-email').value.trim() };
      const problem =
        v.name.length < 3 ? 'اسم المتجر 3 أحرف على الأقل' :
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug) ? 'رابط المتجر: حروف إنجليزية صغيرة وأرقام وشرطة فقط (مثل my-store)' :
        !/^\+?[\d\s()-]{8,16}$/.test(v.phone) ? 'أدخل رقم جوال صحيحاً' :
        !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? 'أدخل بريداً إلكترونياً صحيحاً' :
        !(g.lat != null && g.lng != null) ? 'حدّد موقع متجرك على الخريطة بدقة (استخدم موقعي الحالي أو ابحث عن العنوان) — هذا ما يعرض متجرك للمشترين القريبين منك' :
        !$('#s-terms').checked ? 'وافق على الشروط للمتابعة' : '';
      if (problem) { err.textContent = problem; return; }
      err.textContent = '';
      const s = M.seller.create({ name: v.name, slug: v.slug, category: $('#s-cat').value, phone: v.phone, email: v.email, description: $('#s-desc').value.trim(), logo: setupLogo, address: g });
      if (!s) { err.textContent = 'تعذّر الحفظ، مساحة التخزين ممتلئة'; return; }
      location.hash = '#/dashboard';
      root.innerHTML = '';
      render();
    });
  }
  function fld(id, label, control, hint) {
    return '<div class="field"><label class="label" for="' + id + '">' + label + '</label>' + control + (hint ? '<p class="hint">' + hint + '</p>' : '') + '</div>';
  }
  Seller.fld = fld;

  /* ---------- لوحة التحكم ---------- */
  function alertsHTML() {
    const out = [];
    const prods = M.products.list();
    const low = prods.filter((p) => p.status === 'active' && p.stock <= 3);
    const c = M.orders.counts();
    if (!prods.length) out.push(['box', 'لم تضف منتجات بعد. أضف أول منتج ليظهر في المتجر.', '#/products/new', 'أضف منتجاً']);
    if (c.new) out.push(['list', c.new + ' طلب جديد بانتظار قبولك.', '#/orders?tab=new', 'راجع الطلبات']);
    if (low.length) out.push(['alert', low.length + ' منتج مخزونه 3 قطع أو أقل.', '#/products?f=low', 'حدّث المخزون']);
    const open = M.tickets.list().filter((t) => t.status === 'open').length;
    if (open) out.push(['chat', open + ' تذكرة دعم مفتوحة.', '#/support', 'افتح الدعم']);
    if (!out.length) return '';
    return '<ul class="alerts">' + out.map((a) => '<li>' + ic(a[0]) + '<span>' + a[1] + '</span><a href="' + a[2] + '">' + a[3] + '</a></li>').join('') + '</ul>';
  }

  function qualityTable() {
    let list = M.products.list().map((p) => ({ p, demo: false }));
    if (!list.length) return card('فحص جودة القوائم', empty({ icon: 'check', title: 'لا توجد منتجات لفحصها', text: 'أضف منتجاً وسنقيّم صوره ووصفه ومواصفاته ومخزونه.', action: { href: '#/products/new', label: 'أضف منتجاً' } }));
    return card('فحص جودة القوائم',
      '<div class="dtable-wrap"><table class="dtable"><thead><tr><th>المنتج</th><th>التصنيف</th><th>أخطاء</th><th>تحذيرات</th><th>ناجح</th><th>درجة الجودة</th></tr></thead><tbody>' +
      list.map((x) => {
        const q = M.products.quality(x.p);
        return '<tr><td><div class="pcell">' + pimg(x.p) + '<span>' + esc(x.p.name) + (x.demo ? ' <em class="tag-demo">تجريبي</em>' : '') + '</span></div></td><td>' + esc(window.Products.categoryName(x.p.category)) + '</td>' +
          '<td>' + (q.errors.length ? '<strong class="txt-bad">' + q.errors.length + '</strong>' : '0') + '</td><td>' + q.warns.length + '</td><td>' + q.passed + '/' + q.total + '</td>' +
          '<td><div class="score"><div class="score__bar"><span style="width:' + q.score + '%"></span></div><strong>' + q.score + '</strong></div></td></tr>';
      }).join('') + '</tbody></table></div>');
  }

  /* ---------- بيانات لوحة التحكم — كلها حقيقية من Supabase (بلا أي بيانات وهمية) ----------
     المصدر: M.orders.list() و M.products.list()، وكلاهما يُقرأ مباشرة من قاعدة البيانات
     (store_orders / products عبر RPC في cloud.js)، وليس من أي مولّد أو تخزين محلي وهمي. */
  const ORDER_GROUPS = { new: ['new'], progress: ['accepted', 'preparing', 'ready', 'out_for_delivery', 'processing', 'shipped'], completed: ['delivered', 'completed'], cancelled: ['cancelled', 'returned'] };
  function groupOf(status) { for (const g in ORDER_GROUPS) if (ORDER_GROUPS[g].indexOf(status) > -1) return g; return 'progress'; }
  const LOW_STOCK_MAX = 3;
  const DAY_MS = 86400000;
  const F_MONTH = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'short' });
  const DASH_FILTERS = [['today', 'اليوم'], ['7d', '7 أيام'], ['30d', '30 يوماً'], ['month', 'هذا الشهر'], ['custom', 'فترة مخصصة']];
  const DASH_KEY = 'nq_dash_filter_v1', GRAN_KEY = 'nq_dash_gran_v1';
  const toDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const inputDate = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));

  function dashFilter() {
    let f; try { f = JSON.parse(sessionStorage.getItem(DASH_KEY)); } catch (_) { f = null; }
    if (!f || !DASH_FILTERS.some((x) => x[0] === f.key)) f = { key: '30d' };
    return f;
  }
  function dashRange() {
    const f = dashFilter(), today = toDay(new Date()), tomorrow = M.util.addDays(today, 1);
    if (f.key === 'today') return { from: today, to: tomorrow };
    if (f.key === '7d') return { from: M.util.addDays(today, -6), to: tomorrow };
    if (f.key === 'month') return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
    if (f.key === 'custom' && f.from && f.to) {
      const from = toDay(new Date(f.from)), to = M.util.addDays(toDay(new Date(f.to)), 1);
      if (to > from) return { from, to };
    }
    return { from: M.util.addDays(today, -29), to: tomorrow };
  }
  function prevRangeOf(r) { const days = Math.round((r.to - r.from) / DAY_MS); return { from: M.util.addDays(r.from, -days), to: r.from }; }
  function dashGran() { const g = sessionStorage.getItem(GRAN_KEY); return ['day', 'week', 'month'].indexOf(g) > -1 ? g : 'day'; }

  /* نقاط السلسلة الزمنية: يومية (14 يوماً)، أسبوعية (10 أسابيع متدحرجة)، شهرية (8 أشهر تقويمية) */
  function dayBuckets(nDays) {
    const today = toDay(new Date()), out = [];
    for (let i = nDays - 1; i >= 0; i--) { const d = M.util.addDays(today, -i); out.push({ label: shortKey(M.util.dkey(d)), from: d, to: M.util.addDays(d, 1) }); }
    return out;
  }
  function weekBuckets(nWeeks) {
    const tomorrow = M.util.addDays(toDay(new Date()), 1), out = [];
    for (let i = nWeeks - 1; i >= 0; i--) { const to = M.util.addDays(tomorrow, -7 * i), from = M.util.addDays(to, -7); out.push({ label: shortKey(M.util.dkey(from)), from, to }); }
    return out;
  }
  function monthBuckets(nMonths) {
    const now = new Date(), out = [];
    for (let i = nMonths - 1; i >= 0; i--) { const from = new Date(now.getFullYear(), now.getMonth() - i, 1), to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); out.push({ label: F_MONTH.format(from), from, to }); }
    return out;
  }
  function dashBuckets(gran) { return gran === 'week' ? weekBuckets(10) : gran === 'month' ? monthBuckets(8) : dayBuckets(14); }

  /* الربح الحقيقي = صافي قيمة المنتجات بعد خصم عمولة المنصة (نفس نسبة العمولة CFG.commission
     المستخدمة في كل مكان آخر بالتطبيق: صفحة الإعداد والمحفظة)، وليس رقماً وهمياً. */
  function orderProfit(o) { return M.util.round2(o.gross * (1 - CFG.commission)); }

  function aggregateByProduct(list) {
    const rows = {};
    list.forEach((o) => {
      if (groupOf(o.status) === 'cancelled') return;
      (o.lines || []).forEach((l) => {
        const r = rows[l.productId] || (rows[l.productId] = { id: l.productId, name: l.name, qty: 0, revenue: 0 });
        r.qty += Number(l.qty || 0); r.revenue += Number(l.price || 0) * Number(l.qty || 0);
      });
    });
    return Object.keys(rows).map((k) => rows[k]).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  }

  function computeForRange(r, allOrders) {
    const rows = allOrders.filter((o) => { const t = new Date(o.createdAt); return t >= r.from && t < r.to; });
    let sales = 0, profit = 0;
    const counts = { new: 0, progress: 0, completed: 0, cancelled: 0 };
    rows.forEach((o) => { const g = groupOf(o.status); counts[g]++; if (g !== 'cancelled') { sales += o.gross; profit += orderProfit(o); } });
    return { orders: rows, total: rows.length, sales: M.util.round2(sales), profit: M.util.round2(profit), counts, topProducts: aggregateByProduct(rows) };
  }

  function dashboardData() {
    const rg = dashRange(), allOrders = M.orders.list();
    const cur = computeForRange(rg, allOrders), prev = computeForRange(prevRangeOf(rg), allOrders);
    const prods = M.products.list().filter((p) => p.status !== 'archived');
    const low = prods.filter((p) => p.stock <= LOW_STOCK_MAX);
    return { range: rg, cur, prev, productCount: prods.length, lowStock: low.length, lowList: low };
  }

  Seller.actions['dash-filter'] = (b) => {
    const key = b.dataset.key, f = { key };
    if (key === 'custom') {
      const old = dashFilter(), today = new Date();
      f.from = old.from || M.util.addDays(today, -29).toISOString();
      f.to = old.to || today.toISOString();
    }
    sessionStorage.setItem(DASH_KEY, JSON.stringify(f));
    render();
  };
  Seller.actions['dash-apply-custom'] = () => {
    const fromEl = $('#dash-from'), toEl = $('#dash-to');
    if (!fromEl || !toEl || !fromEl.value || !toEl.value) return;
    if (new Date(toEl.value) < new Date(fromEl.value)) { U.toast('تاريخ النهاية قبل تاريخ البداية', { type: 'error' }); return; }
    sessionStorage.setItem(DASH_KEY, JSON.stringify({ key: 'custom', from: fromEl.value, to: toEl.value }));
    render();
  };
  Seller.actions['dash-gran'] = (b) => { sessionStorage.setItem(GRAN_KEY, b.dataset.key); render(); };
  Seller.actions['dash-export'] = () => {
    const d = dashboardData();
    const rows = [['رقم الطلب', 'التاريخ', 'الحالة', 'إجمالي المبيعات', 'الأرباح']];
    d.cur.orders.forEach((o) => rows.push([o.id, dateTimeAr(o.createdAt), M.STATUS[o.status] || o.status, o.gross, groupOf(o.status) === 'cancelled' ? 0 : orderProfit(o)]));
    csv(rows, 'nasaq-dashboard-' + M.util.dkey() + '.csv');
  };

  /* بطاقة الترحيب: حالة المتجر، ظهوره للعملاء حسب الموقع، اكتمال الوسائط، واختصارات سريعة */
  function storeHeroHTML(d) {
    const s = M.seller.get() || {}, list = M.products.list();
    const hasLoc = s.latitude != null && s.longitude != null;
    const radius = (window.Products && window.Products.radiusKm) || 50;
    const withVideo = list.filter((p) => p.video).length;
    const noPhoto = list.filter((p) => !(p.photos && p.photos.length)).length;
    const place = [s.address && s.address.area, s.address && s.address.city].filter(Boolean).join('، ');
    const chip = (ok, okT, badT, href) => '<a class="hero-chip hero-chip--' + (ok ? 'ok' : 'warn') + '" href="' + href + '">' + ic(ok ? 'check' : 'alert') + '<span>' + (ok ? okT : badT) + '</span></a>';
    return '<section class="dhero" aria-label="ملخص المتجر">' +
      '<div class="dhero__main">' +
        '<p class="dhero__eyebrow">' + ic('store') + 'متجرك على نَسَق</p>' +
        '<h2>' + esc(s.name || 'متجري') + '</h2>' +
        '<p class="dhero__sub">' + (hasLoc
          ? 'يظهر متجرك للعملاء الذين يبعدون <strong>' + radius + ' كم</strong> أو أقل عن موقعك' + (place ? ' — ' + esc(place) : '') + '.'
          : 'لم تحدّد موقع متجرك بعد، ولن يظهر لأي عميل حتى تضيفه.') + '</p>' +
        '<div class="dhero__chips">' +
          chip(hasLoc, 'الموقع محفوظ في قاعدة البيانات', 'حدّد موقع المتجر', '#/settings') +
          chip(list.length > 0, fmt(list.length) + ' منتج منشور', 'أضف أول منتج', '#/products/new') +
          chip(noPhoto === 0 && list.length > 0, 'كل المنتجات بصور', noPhoto ? fmt(noPhoto) + ' منتج بلا صور' : 'أضف صور المنتجات', '#/products') +
          '<a class="hero-chip hero-chip--info" href="#/products">' + ic('play') + '<span>' + fmt(withVideo) + ' منتج بفيديو</span></a>' +
        '</div>' +
      '</div>' +
      '<div class="dhero__actions">' +
        '<a class="btn btn--primary" href="#/products/new">' + ic('plus') + 'إضافة منتج</a>' +
        '<a class="btn btn--ghost" href="#/orders">' + ic('list') + 'الطلبات</a>' +
        '<a class="btn btn--ghost" href="#/support">' + ic('chat') + 'الدعم</a>' +
      '</div>' +
    '</section>';
  }

  Seller.views.dashboard = () => {
    const f = dashFilter(), gran = dashGran(), d = dashboardData(), cur = d.cur, prev = d.prev;
    const kpi = (icon, label, value, g, extra) => '<div class="dcard kpi"><div class="kpi__l">' + ic(icon) + label + '</div><div class="kpi__v">' + value + '</div><div class="kpi__f">' + (g == null ? '' : growth(g)) + (extra ? '<span>' + extra + '</span>' : '') + '</div></div>';

    const bks = dashBuckets(gran), allOrders = M.orders.list();
    const ser = bks.map((b) => {
      const rows = allOrders.filter((o) => { const t = new Date(o.createdAt); return t >= b.from && t < b.to; });
      let s = 0, p = 0; rows.forEach((o) => { if (groupOf(o.status) !== 'cancelled') { s += o.gross; p += orderProfit(o); } });
      return { label: b.label, sales: M.util.round2(s), profit: M.util.round2(p), orders: rows.length };
    });
    const labels = ser.map((x) => x.label);
    const granLabel = gran === 'week' ? 'أسبوعياً' : gran === 'month' ? 'شهرياً' : 'يومياً';

    const top = cur.topProducts.slice(0, 6);
    const maxQty = top.length ? top[0].qty : 1;
    const shortName = (nm) => (nm && nm.length > 16 ? nm.slice(0, 15) + '…' : (nm || 'منتج محذوف'));

    const filtersHTML = '<div class="dcard dash-filters">' +
        '<div class="chips" role="group" aria-label="فترة الإحصائيات">' +
          DASH_FILTERS.map((x) => '<button type="button" class="chip" aria-pressed="' + (f.key === x[0]) + '" data-act="dash-filter" data-key="' + x[0] + '">' + x[1] + '</button>').join('') +
        '</div>' +
        (f.key === 'custom' ? '<div class="dash-filters__custom">' +
          '<label>من <input type="date" class="input" id="dash-from" value="' + esc(f.from ? inputDate(f.from) : inputDate(M.util.addDays(new Date(), -29))) + '"></label>' +
          '<label>إلى <input type="date" class="input" id="dash-to" value="' + esc(f.to ? inputDate(f.to) : inputDate(new Date())) + '"></label>' +
          '<button type="button" class="btn btn--primary btn--sm" data-act="dash-apply-custom">تطبيق</button>' +
        '</div>' : '') +
      '</div>';

    const statusGroups = [['جديد', cur.counts.new, 0], ['قيد التنفيذ', cur.counts.progress, 1], ['مكتمل', cur.counts.completed, 2], ['ملغي', cur.counts.cancelled, 3]];
    const topKpi = top[0] ? esc(shortName(top[0].name)) : '—';

    const html =
      pageHead('لوحة التحكم', 'كل الأرقام هنا حقيقية من قاعدة بيانات متجرك وتتحدّث تلقائياً حسب الفترة المختارة',
        cur.total ? '<button type="button" class="btn btn--ghost btn--sm" data-act="dash-export">' + ic('download') + 'تصدير CSV</button>' : '') +
      storeHeroHTML(d) +
      filtersHTML +
      alertsHTML() +
      '<div class="kpis">' +
        kpi('cash', 'إجمالي المبيعات', money(cur.sales), pct(cur.sales, prev.sales)) +
        kpi('gift', 'إجمالي الأرباح', money(cur.profit), pct(cur.profit, prev.profit), 'بعد عمولة المنصة ' + Math.round(CFG.commission * 100) + '%') +
        kpi('list', 'عدد الطلبات', fmt(cur.total), pct(cur.total, prev.total)) +
        kpi('bell', 'طلبات جديدة', fmt(cur.counts.new)) +
        kpi('clock', 'قيد التنفيذ', fmt(cur.counts.progress)) +
        kpi('check', 'طلبات مكتملة', fmt(cur.counts.completed)) +
        kpi('close', 'طلبات ملغاة', fmt(cur.counts.cancelled)) +
        kpi('box', 'عدد المنتجات', fmt(d.productCount)) +
        kpi('alert', 'مخزون منخفض', fmt(d.lowStock), null, d.lowStock ? '<a href="#/products?f=low">مراجعة المخزون</a>' : 'لا يوجد') +
        kpi('tag', 'الأكثر مبيعاً', topKpi, null, top[0] ? fmt(top[0].qty) + ' قطعة مباعة' : 'لا توجد مبيعات بعد') +
      '</div>' +
      '<div class="dcard">' +
        '<div class="dcard__head"><h2>اتجاه المبيعات والأرباح وعدد الطلبات</h2>' +
          '<div class="chips" role="group" aria-label="التجميع الزمني">' +
            [['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']].map((g) => '<button type="button" class="chip" aria-pressed="' + (gran === g[0]) + '" data-act="dash-gran" data-key="' + g[0] + '">' + g[1] + '</button>').join('') +
          '</div></div>' +
        '<figure class="dfig">' + C.line({ labels, series: [{ name: 'المبيعات', values: ser.map((x) => x.sales) }, { name: 'الأرباح', values: ser.map((x) => x.profit), area: false }], fmt: money, label: 'اتجاه المبيعات والأرباح ' + granLabel }) +
          C.legend([{ label: 'المبيعات', s: 0 }, { label: 'الأرباح', s: 1 }]) + '</figure>' +
        '<figure class="dfig">' + C.bars({ labels, series: [{ name: 'عدد الطلبات', values: ser.map((x) => x.orders) }], label: 'عدد الطلبات ' + granLabel }) + '</figure>' +
      '</div>' +
      '<div class="dgrid dgrid--half">' +
        card('توزيع حالات الطلبات', cur.total ? '<div class="donut">' + C.donut({ items: statusGroups.map((s) => ({ label: s[0], value: s[1], s: s[2] })), center: { value: cur.total, label: 'طلب' }, label: 'توزيع حالات الطلبات' }) +
          C.legend(statusGroups.map((s) => ({ label: s[0], value: s[1], s: s[2] }))) + '</div>' : empty({ icon: 'list', title: 'لا توجد طلبات في هذه الفترة' })) +
        card('أكثر المنتجات مبيعاً', top.length ?
          '<figure class="dfig">' + C.bars({ labels: top.map((p) => shortName(p.name)), series: [{ name: 'الكمية المباعة', values: top.map((p) => p.qty) }], label: 'أكثر المنتجات مبيعاً' }) + '</figure>' +
          '<ul class="hbars">' + top.map((p) => '<li><span>' + esc(shortName(p.name)) + '</span><div><i style="width:' + Math.round((p.qty / maxQty) * 100) + '%"></i></div><strong>' + fmt(p.qty) + '</strong></li>').join('') + '</ul>'
          : empty({ icon: 'box', title: 'لا توجد مبيعات في هذه الفترة' })) +
      '</div>' +
      qualityTable();
    return { html };
  };

  /* ---------- الإحصائيات ---------- */
  Seller.views.stats = () => {
    const n = range(), sm = M.stats.summary(n), ser = M.stats.series(n), c = sm.cur;
    const labels = ser.map((d) => shortKey(d.date));
    const kpi = (label, value, g) => '<div class="dcard kpi kpi--sm"><div class="kpi__l">' + label + '</div><div class="kpi__v">' + value + '</div><div class="kpi__f">' + (g == null ? '' : growth(g)) + '</div></div>';
    const dow = [0, 0, 0, 0, 0, 0, 0], names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    ser.forEach((d) => { dow[d.dow] += d.v; });
    const funnel = [['المشاهدات', c.v], ['إضافات للسلة', c.c], ['الطلبات', c.o]];
    const rows = M.stats.byProduct(n).filter((r) => r.views || r.sold);
    const cities = M.stats.cities(n).slice(0, 8), maxCity = cities.length ? cities[0].n : 1;
    const html =
      pageHead('الإحصائيات', 'زيارات المتجر وسلوك العملاء والمبيعات', rangeSelect()) +
      '<div class="kpis kpis--7">' +
        kpi('المشاهدات', fmt(c.v), sm.growth.v) + kpi('زوار فريدون', fmt(c.u), sm.growth.u) + kpi('إضافات للسلة', fmt(c.c), sm.growth.c) +
        kpi('الطلبات', fmt(c.o), sm.growth.o) + kpi('التحويل', sm.conv + '%') + kpi('متوسط الطلب', money(sm.aov)) + kpi('إجمالي المبيعات', money(c.r), sm.growth.r) +
      '</div>' +
      card('الزيارات والزوار والطلبات', '<figure class="dfig">' + C.line({ labels, series: [{ name: 'المشاهدات', values: ser.map((d) => d.v) }, { name: 'زوار فريدون', values: ser.map((d) => d.u), area: false }], label: 'المشاهدات والزوار الفريدون' }) +
        C.legend([{ label: 'المشاهدات', s: 0 }, { label: 'زوار فريدون', s: 1 }]) + '</figure>') +
      '<div class="dgrid dgrid--half">' +
        card('قمع التحويل', '<ul class="funnel">' + funnel.map((f, i) => '<li><span>' + f[0] + '</span><div><i style="width:' + (funnel[0][1] ? Math.max(3, Math.round((f[1] / funnel[0][1]) * 100)) : 0) + '%"></i></div><strong>' + fmt(f[1]) + '</strong>' + (i ? '<small>' + (funnel[i - 1][1] ? Math.round((f[1] / funnel[i - 1][1]) * 100) : 0) + '% من السابق</small>' : '') + '</li>').join('') + '</ul>') +
        card('الزيارات حسب أيام الأسبوع', '<figure class="dfig">' + C.bars({ labels: names, series: [{ name: 'المشاهدات', values: dow }], label: 'المشاهدات حسب يوم الأسبوع' }) + '</figure>') +
      '</div>' +
      '<div class="dgrid dgrid--main">' +
        card('أداء المنتجات', rows.length ? '<div class="dtable-wrap"><table class="dtable"><thead><tr><th>المنتج</th><th>مشاهدات</th><th>سلة</th><th>مبيعات</th><th>تحويل</th><th>الإيراد</th></tr></thead><tbody>' +
          rows.slice(0, 12).map((r) => '<tr><td>' + esc(r.name) + '</td><td>' + fmt(r.views) + '</td><td>' + fmt(r.carts) + '</td><td>' + fmt(r.sold) + '</td><td>' + (r.views ? ((r.sold / r.views) * 100).toFixed(1) : '0.0') + '%</td><td>' + money(r.revenue) + '</td></tr>').join('') + '</tbody></table></div>'
          : empty({ icon: 'chart', title: 'لا توجد بيانات', text: 'ستظهر إحصائيات كل منتج بعد أول زيارة.' })) +
        card('المدن', cities.length ? '<ul class="hbars">' + cities.map((x) => '<li><span>' + esc(x.city) + '</span><div><i style="width:' + Math.round((x.n / maxCity) * 100) + '%"></i></div><strong>' + x.n + '</strong></li>').join('') + '</ul>' : empty({ icon: 'pin', title: 'لا توجد طلبات بعد' })) +
      '</div>' +
      (M.demo.on() ? '<p class="dnote">' + ic('alert') + 'الأرقام أعلاه تتضمن بيانات تجريبية. يمكنك إيقافها من «إعدادات المتجر».</p>' : '');
    return { html };
  };

  /* ---------- الراوتر ---------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const parts = raw.split('?');
    return { seg: parts[0].split('/').filter(Boolean), q: new URLSearchParams(parts[1] || '') };
  }
  let mounted = null;
  function render() {
    if (!M.seller.exists()) { setupView(); return; }
    if (!$('#dash')) shell();
    M.ads.sweep();
    const r = parseHash(), name = r.seg[0] || 'dashboard';
    const view = Seller.views[name] || Seller.views.dashboard;
    const out = view(r.seg.slice(1), r.q);
    const main = $('#main');
    main.innerHTML = out.html;
    document.title = (out.title || $('h1', main) && $('h1', main).textContent || 'لوحة البائع') + ' | لوحة البائع';
    if (out.mount) out.mount(main);
    refreshChrome();
    $('#dash').classList.remove('is-nav');
    if (mounted !== location.hash) { window.scrollTo(0, 0); mounted = location.hash; }
  }

  /* ---------- أحداث عامة ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'nav-open') { $('#dash').classList.add('is-nav'); return; }
      if (act === 'nav-close') { $('#dash').classList.remove('is-nav'); return; }
      if (act === 'theme') {
        const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
        try { localStorage.setItem(M.K.theme, dark ? 'dark' : 'light'); } catch (_) { /* تجاهل */ }
        applyTheme(); return;
      }
      if (act === 'bell') {
        const p = $('[data-bell-panel]'), open = p.hidden;
        p.hidden = !open; a.setAttribute('aria-expanded', String(open));
        if (open) p.innerHTML = bellHTML();
        return;
      }
      if (act === 'bell-read') { M.notifs.readAll(); $('[data-bell-panel]').innerHTML = bellHTML(); refreshChrome(); return; }
      if (act === 'bell-go') { $('[data-bell-panel]').hidden = true; M.notifs.markRead(a.dataset.id); refreshChrome(); return; }
      if (Seller.actions[act]) { e.preventDefault(); Seller.actions[act](a, e); return; }
    }
    if (!t.closest('.bell')) { const p = $('[data-bell-panel]'); if (p && !p.hidden) { p.hidden = true; $('.bell__btn').setAttribute('aria-expanded', 'false'); } }
    if (t.closest('.dash__nav a')) $('#dash').classList.remove('is-nav');
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-range]')) { sessionStorage.setItem('nq_range', e.target.value); render(); }
  });
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-search]')) return;
    e.preventDefault();
    const q = $('#dash-q').value.trim();
    const cur = parseHash().seg[0];
    location.hash = '#/' + (cur === 'orders' ? 'orders' : 'products') + (q ? '?q=' + encodeURIComponent(q) : '');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const p = $('[data-bell-panel]'); if (p && !p.hidden) { p.hidden = true; $('.bell__btn').focus(); } $('#dash') && $('#dash').classList.remove('is-nav'); } });
  window.addEventListener('hashchange', render);

  /* ---------- بوابة اعتماد المتجر ----------
     لا يُعرض أي شيء من لوحة البائع الحقيقية قبل أن يتحقق seller-gate.js من
     حالة المتجر في قاعدة البيانات (pending / active / rejected / suspended). */
  function gateScreen(gate) {
    const byStatus = {
      'signed-out': { icon: 'user', title: 'سجّل دخولك أولاً', text: 'تحتاج لتسجيل الدخول بحساب البائع لعرض لوحة التحكم.', action: { href: NasaqLinks.url('main', '/auth?next=seller'), label: 'تسجيل الدخول' } },
      'no-store': { icon: 'store', title: 'لم تنشئ متجراً بعد', text: 'قدّم طلب فتح متجر تاجر لتبدأ البيع على نَسَق.', action: { href: '/become-seller', label: 'إنشاء متجر جديد' } },
      pending: { icon: 'clock', title: 'متجرك قيد المراجعة', text: 'فريق عمليات نَسَق يراجع بيانات متجرك الآن، وسيصلك إشعار فور تفعيله (عادة خلال 12 ساعة).' },
      rejected: { icon: 'close', title: 'تعذّر اعتماد المتجر', text: (gate.store && gate.store.review_note) || 'لم تتم الموافقة على طلب المتجر. تواصل مع الدعم لمزيد من التفاصيل.', action: { href: 'mailto:partners@nasaq.example', label: 'تواصل مع الدعم' } },
      suspended: { icon: 'close', title: 'متجرك موقوف حالياً', text: (gate.store && gate.store.review_note) || 'تم إيقاف متجرك مؤقتاً من قِبل الإدارة. تواصل مع الدعم لمعرفة السبب.', action: { href: 'mailto:partners@nasaq.example', label: 'تواصل مع الدعم' } },
      offline: { icon: 'alert', title: 'تعذّر الاتصال بالخادم', text: 'تحقق من اتصالك بالإنترنت وأعد المحاولة.' },
      error: { icon: 'alert', title: 'حدث خطأ غير متوقع', text: 'حاول تحديث الصفحة، وإن استمرت المشكلة تواصل مع الدعم.' }
    };
    const info = byStatus[gate.status] || byStatus.error;
    root.innerHTML = '<div class="dash-gate">' + empty({
      icon: info.icon, title: info.title, text: info.text,
      action: info.action
    }) + '</div>';
  }

  async function boot() {
    /* لا نمسح root هنا: الصفحة تبدأ بسكيلتون ثابت في /seller، فيبقى ظاهراً
       (مع Shimmer) طوال فحص حالة المتجر، ثم gateScreen()/render() يستبدله بالمحتوى الحقيقي دفعة واحدة. */
    const gate = await (window.NasaqSellerGateReady || Promise.resolve({ status: 'active' }));
    if (gate.status !== 'active') { gateScreen(gate); return; }
    /* يربط لوحة البائع بمتجره الحقيقي المعتمد في Supabase (بدل أي متجر محلي
       وهمي قديم)، فتُقرأ منتجاته وطلباته من قاعدة البيانات مباشرة. */
    M.seller.syncFromCloud(gate.store);
    window.addEventListener('nasaq:seller-data-ready', render);
    render();
  }
  /* ملفات الأقسام (المنتجات/الطلبات/المحفظة…) تُحمَّل بعد هذا الملف، فننتظر DOMContentLoaded
     حتى تكون كل الأقسام مسجّلة قبل أول رسم (وإلا فتح رابط مباشر مثل #/orders يعرض الرئيسية). */
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
