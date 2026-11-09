/* ==========================================================================
   js/seller-money.js — لوحة البائع: المحفظة والأرباح، الإعلانات المدفوعة، الدعم، الإعدادات
   ⚠️ الدفع هنا تجريبي: لا تُرسل بيانات البطاقة لأي جهة ولا تُحفظ. اربط بوابة دفع حقيقية
   (Stripe / Paymob / Fawry / Moyasar) داخل S.actions['topup'] عند الإطلاق.
   ========================================================================== */
(function () {
  'use strict';
  const BACK_ICON = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align:-3px;margin-inline-end:4px"><path d="M9 6l6 6-6 6"/></svg>';
  const S = window.Seller;
  if (!S) return;
  const { M, U, esc, money, fmt, ic, $, $$, dateAr, dateTimeAr, pill, pimg, empty, card, pageHead, armed, fld } = S;
  const CFG = window.Store.config, P = window.Products;
  const toLatin = (v) => String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const numOf = (v) => { const n = Number(toLatin(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
  const luhn = (num) => { let sum = 0, alt = false; for (let i = num.length - 1; i >= 0; i--) { let d = Number(num[i]); if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; };
  const AD_STATUS = { active: ['completed', 'نشطة'], paused: ['processing', 'متوقفة'], scheduled: ['new', 'مجدولة'], ended: ['cancelled', 'منتهية'] };

  /* =====================================================================
     الأرباح والمحفظة
     ===================================================================== */
  const TX = { topup: ['شحن رصيد الإعلانات', 1], 'ad-credit': ['إعلان (من رصيد الإعلانات)', -1], 'ad-earnings': ['إعلان (من الأرباح)', -1], payout: ['سحب أرباح', -1] };

  S.views.wallet = () => {
    const w = M.wallet.summary(), tx = M.wallet.tx(), s = M.seller.get();
    const pay = s.payout || {};
    const stat = (label, value, sub, cls) => '<div class="dcard kpi ' + (cls || '') + '"><div class="kpi__l">' + label + '</div><div class="kpi__v">' + money(value) + '</div><div class="kpi__f"><span>' + sub + '</span></div></div>';
    const html =
      pageHead('الأرباح والمحفظة', 'أرباحك بعد عمولة المنصة (' + Math.round(CFG.commission * 100) + '%) ورصيد إعلاناتك') +
      '<div class="kpis">' +
        stat('الرصيد المتاح للسحب', w.available, 'من طلبات مكتملة', 'kpi--hi') +
        stat('أرباح قيد الانتظار', w.pending, 'طلبات لم تكتمل بعد') +
        stat('رصيد الإعلانات', w.adCredit, 'يُستخدم لدفع الحملات') +
        stat('إجمالي الأرباح المؤكدة', w.lifetime, 'منذ بداية المتجر') +
      '</div>' +
      '<div class="dgrid dgrid--half">' +
        card('سحب الأرباح',
          '<form class="dform" id="payout-form" novalidate>' +
            fld('w-amt', 'المبلغ (' + CFG.currency + ')', '<input class="input" id="w-amt" inputmode="decimal" dir="ltr" placeholder="' + CFG.minPayout + '">', 'أقل مبلغ للسحب ' + money(CFG.minPayout)) +
            fld('w-method', 'طريقة الاستلام', '<select class="select" id="w-method"><option>تحويل بنكي</option><option>محفظة إلكترونية</option><option>إنستاباي</option></select>') +
            '<p class="hint">' + (pay.account ? 'الحساب المحفوظ: ' + esc(pay.holder || '') + ' — ' + esc(maskAcc(pay.account)) : 'أضف بيانات الاستلام من «إعدادات المتجر» أولاً.') + '</p>' +
            '<p class="field__error" id="payout-error" role="alert"></p>' +
            '<button class="btn btn--primary" type="submit"' + (pay.account ? '' : ' disabled') + '>اطلب السحب</button></form>') +
        card('شحن رصيد الإعلانات',
          '<form class="dform" id="topup-form" novalidate autocomplete="off">' +
            '<p class="dnote dnote--warn">' + ic('alert') + 'وضع تجريبي: لن يتم سحب أي مبلغ فعلي ولا تُحفظ بيانات البطاقة.</p>' +
            fld('t-amt', 'المبلغ (' + CFG.currency + ')', '<input class="input" id="t-amt" inputmode="decimal" dir="ltr" placeholder="500">', 'من 50 إلى 10,000') +
            fld('t-card', 'رقم البطاقة', '<input class="input" id="t-card" inputmode="numeric" dir="ltr" placeholder="0000 0000 0000 0000" maxlength="23">') +
            '<div class="dform__row">' + fld('t-exp', 'الانتهاء', '<input class="input" id="t-exp" dir="ltr" placeholder="MM/YY" maxlength="5">') + fld('t-cvv', 'CVV', '<input class="input" id="t-cvv" inputmode="numeric" dir="ltr" placeholder="123" maxlength="4">') + '</div>' +
            '<p class="field__error" id="topup-error" role="alert"></p>' +
            '<button class="btn btn--accent" type="submit">اشحن الرصيد</button></form>') +
      '</div>' +
      card('سجل المعاملات', tx.length
        ? '<div class="dtable-wrap"><table class="dtable"><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>' +
          tx.map((t) => { const m = TX[t.type] || [t.type, -1]; return '<tr><td>' + dateTimeAr(t.date) + '</td><td>' + m[0] + '</td><td>' + esc(t.note || '') + '</td><td class="' + (m[1] > 0 ? 'txt-good' : '') + '">' + (m[1] > 0 ? '+' : '−') + money(t.amount) + '</td><td>' + (t.status === 'processing' ? pill('processing', 'قيد التحويل') : pill('completed', 'تم')) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : empty({ icon: 'cash', title: 'لا توجد معاملات بعد', text: 'ستظهر هنا عمليات السحب وشحن رصيد الإعلانات ودفع الحملات.' })) +
      '<p class="dnote">' + ic('alert') + 'تُضاف أرباح الطلب إلى الرصيد المتاح عند اكتماله (تم التسليم). تُخصم عمولة المنصة ' + Math.round(CFG.commission * 100) + '% من قيمة المنتجات دون الشحن.</p>';

    function mount(root) {
      $('#payout-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const r = M.wallet.payout(numOf($('#w-amt', root).value), $('#w-method', root).value);
        if (!r.ok) { $('#payout-error', root).textContent = r.error; return; }
        S.toast('تم استلام طلب السحب، سيصلك خلال 2 إلى 5 أيام عمل'); S.rerender();
      });
      const card = $('#t-card', root), exp = $('#t-exp', root);
      card.addEventListener('input', () => { card.value = toLatin(card.value).replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); });
      exp.addEventListener('input', () => { const v = toLatin(exp.value).replace(/\D/g, '').slice(0, 4); exp.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; });
      $('#topup-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = numOf($('#t-amt', root).value), num = toLatin(card.value).replace(/\D/g, ''), m = /^(\d\d)\/(\d\d)$/.exec(exp.value);
        const yr = m ? 2000 + Number(m[2]) : 0, ok = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && (yr > new Date().getFullYear() || (yr === new Date().getFullYear() && Number(m[1]) >= new Date().getMonth() + 1));
        const bad = !(amt >= 50 && amt <= 10000) ? 'المبلغ بين 50 و10,000' : !(num.length >= 13 && luhn(num)) ? 'رقم البطاقة غير صحيح' : !ok ? 'تاريخ الانتهاء غير صحيح أو منتهٍ' : !/^\d{3,4}$/.test(toLatin($('#t-cvv', root).value)) ? 'رمز CVV غير صحيح' : '';
        if (bad) { $('#topup-error', root).textContent = bad; return; }
        M.wallet.topup(amt, '•••• ' + num.slice(-4));
        S.toast('تم شحن ' + money(amt) + ' في رصيد الإعلانات'); S.rerender();
      });
    }
    return { html, mount };
  };
  const maskAcc = (a) => (a.length > 6 ? a.slice(0, 3) + '•••••' + a.slice(-3) : '•••••');

  /* =====================================================================
     الإعلانات المدفوعة
     ===================================================================== */
  const PL_ICON = { hero: 'megaphone', category: 'tag', product: 'gift' };

  function adsList() {
    const list = M.ads.list(), w = M.wallet.summary();
    const act = list.filter((c) => M.ads.statusOf(c) === 'active').length;
    const imp = list.reduce((a, c) => a + c.impressions, 0), clk = list.reduce((a, c) => a + c.clicks, 0), spend = list.reduce((a, c) => a + c.total, 0);
    const ctr = imp ? ((clk / imp) * 100).toFixed(2) : '0.00';
    const kpi = (l, v) => '<div class="dcard kpi kpi--sm"><div class="kpi__l">' + l + '</div><div class="kpi__v">' + v + '</div></div>';
    const html =
      pageHead('الإعلانات', 'ادفع لتظهر لافتاتك ومنتجاتك في أهم أماكن المتجر', '<span class="chip-info">رصيد الإعلانات: <strong>' + money(w.adCredit) + '</strong></span><a class="btn btn--ghost btn--sm" href="#/wallet">شحن الرصيد</a>') +
      '<div class="kpis">' + kpi('حملات نشطة', act) + kpi('مرات الظهور', fmt(imp)) + kpi('النقرات', fmt(clk)) + kpi('نسبة النقر', ctr + '%') + kpi('إجمالي الإنفاق', money(spend)) + '</div>' +
      card('أماكن الإعلان', '<div class="placements">' + Object.keys(CFG.adPlacements).map((k) => {
        const pl = CFG.adPlacements[k];
        return '<div class="placement"><span class="placement__ic">' + ic(PL_ICON[k]) + '</span><h3>' + esc(pl.name) + '</h3><p>' + esc(pl.desc) + '</p><div class="placement__p"><strong>' + money(pl.perDay) + '</strong> / يوم</div>' +
          '<a class="btn btn--primary btn--sm" href="#/ads/new?type=' + k + '">أنشئ حملة</a></div>';
      }).join('') + '</div><p class="hint">خصم ' + CFG.adDiscounts.map((d) => Math.round(d.off * 100) + '% لمدة ' + d.days + ' يوماً فأكثر').join('، ') + '. الإعلانات المخالفة تُزال دون استرداد.</p>') +
      card('حملاتك', list.length
        ? '<div class="dtable-wrap"><table class="dtable"><thead><tr><th>الحملة</th><th>المكان</th><th>الفترة</th><th>الحالة</th><th>ظهور</th><th>نقرات</th><th>CTR</th><th>التكلفة</th><th><span class="sr-only">إجراء</span></th></tr></thead><tbody>' +
          list.map((c) => { const st = M.ads.statusOf(c), m = AD_STATUS[st]; return '<tr><td>' + esc(c.name) + '</td><td>' + esc(CFG.adPlacements[c.type].name) + '</td><td>' + dateAr(M.util.parseKey(c.start)) + ' – ' + dateAr(M.util.parseKey(M.ads.endOf(c))) + '</td><td>' + pill(m[0], m[1]) + '</td>' +
            '<td>' + fmt(c.impressions) + '</td><td>' + fmt(c.clicks) + '</td><td>' + (c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00') + '%</td><td>' + money(c.total) + '</td>' +
            '<td class="acts">' + (st === 'ended' ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-act="ad-toggle" data-id="' + c.id + '">' + (c.paused ? 'استئناف' : 'إيقاف مؤقت') + '</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : empty({ icon: 'megaphone', title: 'لا توجد حملات بعد', text: 'اختر مكان الإعلان أعلاه وابدأ حملتك الأولى.' }));
    return { html };
  }
  S.actions['ad-toggle'] = (b) => { const c = M.ads.get(b.dataset.id); if (!c) return; M.ads.update(c.id, { paused: !c.paused }); S.toast(c.paused ? 'تم استئناف الحملة' : 'تم إيقاف الحملة مؤقتاً'); S.rerender(); };

  function adForm(q) {
    const s = M.seller.get(), t0 = q.get('type');
    const d = { type: CFG.adPlacements[t0] ? t0 : 'hero', name: '', title: '', text: '', cta: 'تسوّق الآن', img: '', target: 'store', productId: '', custom: '', category: '', start: M.util.dkey(), days: 7, source: 'credit' };
    const own = M.products.list().filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name, demo: false }));
    const pool = own;
    if (pool.length) d.productId = pool[0].id;

    const html =
      pageHead('حملة إعلانية جديدة', '<a href="#/ads">' + BACK_ICON + 'العودة إلى الإعلانات</a>') +
      '<div class="dgrid dgrid--form"><form class="dcard dform" id="ad-form" novalidate>' +
        '<fieldset class="dform__fs"><legend>1. مكان الإعلان</legend><div class="radios" id="ad-types">' + Object.keys(CFG.adPlacements).map((k) => {
          const pl = CFG.adPlacements[k];
          return '<label class="radio"><input type="radio" name="ad-type" value="' + k + '"' + (k === d.type ? ' checked' : '') + '><span><strong>' + esc(pl.name) + '</strong><small>' + money(pl.perDay) + ' / يوم</small></span></label>';
        }).join('') + '</div></fieldset>' +
        '<fieldset class="dform__fs"><legend>2. المحتوى</legend>' +
          fld('a-name', 'اسم الحملة (لك فقط) *', '<input class="input" id="a-name" maxlength="50">') +
          '<div data-when="hero,category">' +
            fld('a-title', 'عنوان الإعلان *', '<input class="input" id="a-title" maxlength="60">') +
            fld('a-text', 'نص قصير', '<input class="input" id="a-text" maxlength="90">') +
            fld('a-cta', 'نص الزر', '<input class="input" id="a-cta" maxlength="20" value="تسوّق الآن">') +
            '<div class="field"><span class="label">صورة اللافتة * <small data-ratio></small></span><div class="logo-up"><span class="ad-pv" data-img-pv>' + ic('upload') + '</span><label class="btn btn--ghost btn--sm">' + ic('upload') + 'اختر صورة<input type="file" accept="image/png,image/jpeg,image/webp" id="a-img" hidden></label></div></div>' +
            '<div class="field" data-when="category">' + '<label class="label" for="a-cat">تظهر في فئة</label><select class="select" id="a-cat"><option value="">كل الفئات</option>' + P.categories.map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join('') + '</select></div>' +
            '<fieldset class="dform__fs dform__fs--in"><legend>عند النقر يذهب العميل إلى</legend><div class="radios">' +
              '<label class="radio"><input type="radio" name="a-target" value="store" checked><span><strong>صفحة متجري</strong></span></label>' +
              '<label class="radio"><input type="radio" name="a-target" value="product"' + (pool.length ? '' : ' disabled') + '><span><strong>منتج محدد</strong></span></label>' +
              '<label class="radio"><input type="radio" name="a-target" value="custom"><span><strong>رابط مخصص</strong></span></label></div>' +
              '<div data-target="product">' + fld('a-tprod', 'المنتج', '<select class="select" id="a-tprod">' + pool.map((p) => '<option value="' + p.id + '">' + esc(p.name) + (p.demo ? ' (تجريبي)' : '') + '</option>').join('') + '</select>') + '</div>' +
              '<div data-target="custom">' + fld('a-custom', 'الرابط', '<input class="input" id="a-custom" dir="ltr" placeholder="https://… أو /shop?cat=bags">', 'http(s) أو صفحة من المتجر فقط') + '</div>' +
            '</fieldset>' +
          '</div>' +
          '<div data-when="product">' + (pool.length ? fld('a-prod', 'المنتج المراد الترويج له *', '<select class="select" id="a-prod">' + pool.map((p) => '<option value="' + p.id + '">' + esc(p.name) + (p.demo ? ' (تجريبي)' : '') + '</option>').join('') + '</select>') : '<p class="dnote dnote--warn">' + ic('alert') + 'أضف منتجاً نشطاً أولاً لتتمكن من ترويجه.</p>') + '</div>' +
        '</fieldset>' +
        '<fieldset class="dform__fs"><legend>3. المدة</legend><div class="dform__row">' +
          fld('a-start', 'تاريخ البدء', '<input class="input" id="a-start" type="date" dir="ltr" min="' + M.util.dkey() + '" value="' + d.start + '">') +
          fld('a-days', 'عدد الأيام', '<select class="select" id="a-days">' + [1, 3, 7, 14, 30, 60].map((n) => '<option value="' + n + '"' + (n === d.days ? ' selected' : '') + '>' + n + ' ' + (n === 1 ? 'يوم' : 'أيام') + '</option>').join('') + '</select>') + '</div></fieldset>' +
        '<fieldset class="dform__fs"><legend>4. الدفع</legend><div class="radios" id="ad-src"></div><div id="ad-quote" class="quote" aria-live="polite"></div></fieldset>' +
        '<p class="field__error" id="ad-error" role="alert"></p>' +
        '<div class="dform__foot"><button class="btn btn--primary" type="submit">ادفع وانشر الحملة</button><a class="btn btn--ghost" href="#/ads">إلغاء</a></div>' +
      '</form><aside class="dcol">' + card('معاينة', '<div id="ad-preview" class="adpv"></div>') + '</aside></div>';

    function mount(root) {
      const g = (id) => $('#' + id, root);
      const show = () => {
        $$('[data-when]', root).forEach((el) => { el.hidden = !el.dataset.when.split(',').includes(d.type); });
        $$('[data-target]', root).forEach((el) => { el.hidden = el.dataset.target !== d.target; });
        const r = CFG.adPlacements[d.type].ratio; const sp = $('[data-ratio]', root); if (sp) sp.textContent = r ? '(المقاس المناسب ' + r + ')' : '';
      };
      const draftCampaign = () => {
        const isP = d.type === 'product';
        const pid = isP ? Number(g('a-prod') ? g('a-prod').value : 0) : (d.target === 'product' ? Number(g('a-tprod').value) : 0);
        const href = isP ? '/product?id=' + pid : d.target === 'store' ? '/store/' + encodeURIComponent(s.slug) : d.target === 'product' ? '/product?id=' + pid : g('a-custom').value.trim();
        return { type: d.type, name: g('a-name').value.trim(), title: g('a-title').value.trim(), text: g('a-text').value.trim(), cta: g('a-cta').value.trim() || 'تسوّق الآن', img: d.img, href, productId: isP ? pid : (pid || ''), category: d.type === 'category' ? g('a-cat').value : '', start: g('a-start').value, days: Number(g('a-days').value) };
      };
      const renderSrc = () => {
        const w = M.wallet.summary();
        $('#ad-src', root).innerHTML = [['credit', 'من رصيد الإعلانات', w.adCredit], ['earnings', 'من أرباحي المتاحة', w.available]].map((x) => '<label class="radio"><input type="radio" name="ad-src" value="' + x[0] + '"' + (d.source === x[0] ? ' checked' : '') + '><span><strong>' + x[1] + '</strong><small>' + money(x[2]) + '</small></span></label>').join('');
      };
      const refresh = () => {
        const c = draftCampaign(), qt = M.ads.quote(c.type, c.days), w = M.wallet.summary(), bal = d.source === 'earnings' ? w.available : w.adCredit;
        $('#ad-quote', root).innerHTML = '<div><span>' + money(qt.perDay) + ' × ' + qt.days + ' يوم</span><strong>' + money(qt.subtotal) + '</strong></div>' + (qt.off ? '<div class="txt-good"><span>خصم المدة (' + Math.round(qt.off * 100) + '%)</span><strong>−' + money(qt.discount) + '</strong></div>' : '') +
          '<div class="quote__t"><span>الإجمالي</span><strong>' + money(qt.total) + '</strong></div>' + (bal < qt.total ? '<p class="txt-bad">رصيدك الحالي ' + money(bal) + ' لا يكفي. <a href="#/wallet">اشحن الرصيد</a> أو اختر مصدراً آخر.</p>' : '');
        const pv = $('#ad-preview', root);
        if (c.type === 'hero') pv.innerHTML = '<div class="adpv__hero">' + U.adSlide(Object.assign({ id: 'pv' }, c, { title: c.title || 'عنوان إعلانك' })) + '</div>';
        else if (c.type === 'category') pv.innerHTML = U.adBanner(Object.assign({ id: 'pv' }, c, { title: c.title || 'عنوان إعلانك' }));
        else { const p = P.byId(c.productId); pv.innerHTML = p ? '<div class="adpv__prod">' + U.pcard(p).replace('class="pcard', 'class="pcard is-pv') + '<span class="badge badge--ad">سيظهر بشارة «مموَّل»</span></div>' : '<p class="hint">اختر منتجاً للمعاينة.</p>'; }
        show();
      };
      renderSrc(); show(); refresh();
      root.addEventListener('change', async (e) => {
        if (e.target.name === 'ad-type') { d.type = e.target.value; refresh(); }
        else if (e.target.name === 'a-target') { d.target = e.target.value; refresh(); }
        else if (e.target.name === 'ad-src') { d.source = e.target.value; refresh(); }
        else if (e.target.id === 'a-img') {
          const f = e.target.files[0]; if (!f) return;
          try { d.img = await M.image(f, { max: d.type === 'category' ? 1600 : 900, q: 0.8 }); $('[data-img-pv]', root).innerHTML = '<img src="' + d.img + '" alt="">'; refresh(); } catch (err) { S.toast(err.message, 'error'); }
        } else refresh();
      });
      root.addEventListener('input', (e) => { if (e.target.closest('#ad-form') && e.target.type !== 'file') refresh(); });
      g('ad-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const c = draftCampaign(), err = g('ad-error');
        const bad = c.name.length < 3 ? 'أدخل اسماً للحملة' :
          c.type !== 'product' && c.title.length < 3 ? 'أدخل عنواناً للإعلان' :
          c.type !== 'product' && !c.img ? 'ارفع صورة اللافتة' :
          c.type === 'product' && !c.productId ? 'اختر المنتج المراد ترويجه' :
          c.type !== 'product' && d.target === 'custom' && !/^(https?:\/\/|[a-z0-9_\-\/]+\.html)/i.test(c.href) ? 'الرابط غير صالح (http(s) أو صفحة من المتجر)' :
          !c.start || c.start < M.util.dkey() ? 'اختر تاريخ بدء صالحاً' : '';
        if (bad) { err.textContent = bad; return; }
        if (c.type === 'product') { c.title = c.title || (P.byId(c.productId) || {}).name || ''; c.img = ''; }
        const r = M.ads.create(c, d.source);
        if (!r.ok) { err.textContent = r.error; return; }
        S.toast('تم نشر حملتك' + (c.start > M.util.dkey() ? ' وستبدأ في ' + c.start : ' وهي تعمل الآن'));
        location.hash = '#/ads';
      });
    }
    return { html, mount, title: 'حملة جديدة' };
  }
  S.views.ads = (args, q) => (args[0] === 'new' ? adForm(q) : adsList());

  /* =====================================================================
     الدعم
     ===================================================================== */
  const FAQ = [
    ['كيف أضيف منتجاً؟', 'من «المنتجات» اضغط «إضافة منتج»، أدخل الاسم والسعر والمخزون وارفع الصور. يظهر المنتج في المتجر فور النشر.'],
    ['كم عمولة المنصة؟', 'عمولة ثابتة ' + Math.round(CFG.commission * 100) + '% من قيمة المنتجات في كل طلب مكتمل (دون الشحن). تظهر لك العمولة والصافي في كل طلب وعند تسعير المنتج.'],
    ['متى أستلم أرباحي؟', 'تُضاف أرباح الطلب إلى «الرصيد المتاح» عند اكتماله. اطلب السحب من «الأرباح والمحفظة» (الحد الأدنى ' + money(CFG.minPayout) + ') وتُحوَّل خلال 2 إلى 5 أيام عمل.'],
    ['كيف أعلن عن منتجاتي؟', 'من «الإعلانات» اختر المكان (لافتة الرئيسية أو لافتة الفئة أو منتج مموَّل)، ارفع الصورة وحدّد المدة وادفع من رصيد الإعلانات أو أرباحك.'],
    ['ماذا أفعل عند وصول طلب جديد؟', 'افتح «الطلبات» واضغط «قبول وبدء التجهيز»، ثم «تم الشحن» عند تسليم الشحنة للمندوب، ثم «تم التسليم» عند وصولها للعميل.'],
    ['متى يُخصم المخزون؟', 'يُخصم تلقائياً عند إنشاء الطلب، وتصلك إشعارات عند نفاد أي منتج.'],
    ['ما سياسة الإرجاع؟', 'يحق للعميل الإرجاع خلال ' + CFG.returnDays + ' يوماً بحالة المنتج الأصلية. تواصل مع الدعم لمعالجة أي حالة إرجاع.'],
    ['كيف أوثّق حسابي؟', 'أكمل نموذج «التوثيق» من الإعدادات (الهوية والصورة)، وتتم مراجعته من فريقنا.']
  ];
  const TK_CATS = ['الطلبات', 'المنتجات', 'الأرباح والسحب', 'الإعلانات', 'مشكلة تقنية', 'أخرى'];

  S.views.support = () => {
    const html =
      pageHead('الدعم', 'نحن هنا لمساعدتك في أي وقت') +
      card('محادثة الدعم', '<p class="dnote">تواصل مباشرة مع فريق الدعم، وأرسل صور للمشكلة، وتابع الردود هنا وفي الإشعارات. كود محادثتك يبدأ بـ <bdi dir="ltr">SL-</bdi>.</p><div class="dform__foot"><button class="btn btn--primary" type="button" id="sup-open">' + ic('chat') + 'فتح محادثة الدعم</button></div>') +
      card('الأسئلة الشائعة', '<div class="faq">' + FAQ.map((f) => '<details><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>').join('') + '</div>');
    function mount(root) { const b = $('#sup-open', root); if (b) b.addEventListener('click', () => window.NasaqSupport && window.NasaqSupport.open()); }
    return { html, mount };
  };

  S.actions['tk-close'] = (b) => { M.tickets.setStatus(b.dataset.id, 'closed'); S.toast('تم إغلاق التذكرة'); S.rerender(); };
  S.actions['tk-open'] = (b) => { M.tickets.setStatus(b.dataset.id, 'open'); S.rerender(); };

  /* =====================================================================
     إعدادات المتجر
     ===================================================================== */
  S.views.settings = () => {
    const s = M.seller.get(), pay = s.payout || {}, pref = s.prefs || { orders: true, stock: true, ads: true };
    let logo = s.logo || '', geo = null;
    const html =
      pageHead('إعدادات المتجر', 'بيانات متجرك وموقعه وبيانات الاستلام') +
      '<div class="dgrid dgrid--half">' +
        card('بيانات المتجر',
          '<form class="dform" id="st-form" novalidate>' +
            '<div class="dform__row">' + fld('st-name', 'اسم المتجر', '<input class="input" id="st-name" maxlength="40" value="' + esc(s.name) + '">') + fld('st-slug', 'رابط المتجر', '<input class="input" id="st-slug" dir="ltr" maxlength="30" value="' + esc(s.slug) + '">') + '</div>' +
            '<div class="dform__row">' + fld('st-phone', 'الجوال', '<input class="input" id="st-phone" dir="ltr" value="' + esc(s.phone || '') + '">') + fld('st-email', 'البريد', '<input class="input" id="st-email" dir="ltr" type="email" value="' + esc(s.email || '') + '">') + '</div>' +
            fld('st-desc', 'نبذة', '<textarea class="textarea" id="st-desc" rows="3" maxlength="300">' + esc(s.description || '') + '</textarea>') +
            '<div class="dform__row">' + fld('st-ret', 'أيام الإرجاع', '<input class="input" id="st-ret" inputmode="numeric" dir="ltr" value="' + esc(s.returnDays) + '">') + fld('st-prep', 'أيام تجهيز الطلب', '<input class="input" id="st-prep" inputmode="numeric" dir="ltr" value="' + esc(s.prepDays) + '">') + '</div>' +
            '<div class="field"><span class="label">الشعار</span><div class="logo-up"><span class="logo-up__pv" data-logo-pv>' + (logo ? '<img src="' + esc(logo) + '" alt="">' : ic('store')) + '</span><label class="btn btn--ghost btn--sm">' + ic('upload') + 'تغيير<input type="file" accept="image/*" data-logo hidden></label></div></div>' +
            '<p class="field__error" id="st-error" role="alert"></p><button class="btn btn--primary" type="submit">حفظ البيانات</button></form>') +
        card('بيانات الاستلام (الأرباح)',
          '<form class="dform" id="pay-form" novalidate>' +
            fld('py-method', 'الطريقة', '<select class="select" id="py-method">' + ['تحويل بنكي', 'محفظة إلكترونية', 'إنستاباي'].map((m) => '<option' + (pay.method === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>') +
            fld('py-holder', 'اسم صاحب الحساب', '<input class="input" id="py-holder" value="' + esc(pay.holder || '') + '">') +
            fld('py-acc', 'رقم الحساب / الآيبان / المحفظة', '<input class="input" id="py-acc" dir="ltr" value="' + esc(pay.account || '') + '">', pay.account ? 'المحفوظ حالياً: ' + esc(maskAcc(pay.account)) : '') +
            '<p class="field__error" id="py-error" role="alert"></p><button class="btn btn--primary" type="submit">حفظ بيانات الاستلام</button></form>') +
      '</div>' +
      card('موقع المتجر (مصدر الشحن)', '<div data-geo-root></div><div class="dform__foot"><button type="button" class="btn btn--primary" data-act="st-loc">حفظ الموقع</button></div>') +
      '<div class="dgrid dgrid--half">' +
        card('التفضيلات',
          '<div class="dform"><span class="label">الإشعارات</span>' +
            [['orders', 'طلب جديد'], ['stock', 'نفاد المخزون'], ['ads', 'حالة الحملات']].map((x) => '<label class="check"><input type="checkbox" data-pref="' + x[0] + '"' + (pref[x[0]] !== false ? ' checked' : '') + '> ' + x[1] + '</label>').join('') +
            '<span class="label">المظهر واللغة</span><div class="dform__foot"><button type="button" class="btn btn--ghost btn--sm" data-act="theme">' + ic('moon') + 'تبديل الوضع الداكن</button><button type="button" class="btn btn--ghost btn--sm" data-lang-open>' + ic('globe') + 'تغيير اللغة</button></div>' +
            '<p class="hint">مفتاح خرائط جوجل: ' + (CFG.googleMapsKey ? 'مفعّل' : 'غير مضبوط. أضفه في <bdi dir="ltr">js/products.js (googleMapsKey)</bdi> لتفعيل الخريطة التفاعلية.') + '</p></div>') +
        card('التوثيق والبيانات',
          '<div class="dform"><p>وثّق هويتك لتحصل على شارة «بائع موثّق».</p><a class="btn btn--ghost btn--sm" href="/become-seller">' + ic('idcard') + 'استكمال التوثيق</a><a class="btn btn--ghost btn--sm" href="/application-status">حالة الطلب</a>' +
          '<label class="check"><input type="checkbox" data-act="demo-toggle"' + (s.demo ? ' checked' : '') + '> عرض بيانات تجريبية (طلبات وزيارات وأرباح)</label>' +
          '<hr><p class="txt-bad">منطقة الخطر</p><button type="button" class="btn btn--ghost btn--sm btn--bad" data-act="st-delete">حذف المتجر وكل بياناته</button></div>') +
      '</div>';

    function mount(root) {
      geo = window.Geo.mount($('[data-geo-root]', root), { value: s.address || {} });
      $('[data-logo]', root).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { logo = await M.image(f, { max: 256, q: 0.85 }); $('[data-logo-pv]', root).innerHTML = '<img src="' + logo + '" alt="">'; } catch (err) { S.toast(err.message, 'error'); } });
      $('#st-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const v = { name: $('#st-name', root).value.trim(), slug: $('#st-slug', root).value.trim(), phone: $('#st-phone', root).value.trim(), email: $('#st-email', root).value.trim() };
        const bad = v.name.length < 3 ? 'اسم المتجر 3 أحرف على الأقل' : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug) ? 'رابط المتجر: حروف إنجليزية صغيرة وأرقام وشرطة' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? 'بريد غير صحيح' : '';
        if (bad) { $('#st-error', root).textContent = bad; return; }
        M.seller.save(Object.assign(v, { description: $('#st-desc', root).value.trim(), returnDays: numOf($('#st-ret', root).value) || 14, prepDays: numOf($('#st-prep', root).value) || 2, logo }));
        S.toast('تم حفظ بيانات المتجر'); location.reload();
      });
      $('#pay-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const acc = $('#py-acc', root).value.trim(), holder = $('#py-holder', root).value.trim();
        if (holder.length < 3 || acc.length < 6) { $('#py-error', root).textContent = 'أدخل اسم صاحب الحساب ورقماً صحيحاً (6 خانات على الأقل)'; return; }
        M.seller.save({ payout: { method: $('#py-method', root).value, holder, account: acc } }); S.toast('تم حفظ بيانات الاستلام'); S.rerender();
      });
      root.addEventListener('change', (e) => {
        if (e.target.dataset.pref) { const p = Object.assign({ orders: true, stock: true, ads: true }, M.seller.get().prefs); p[e.target.dataset.pref] = e.target.checked; M.seller.save({ prefs: p }); S.toast('تم حفظ التفضيلات'); }
        if (e.target.dataset.act === 'demo-toggle') { M.demo.set(e.target.checked); S.toast(e.target.checked ? 'تم تفعيل البيانات التجريبية' : 'تم إيقاف البيانات التجريبية'); }
      });
      S.actions['st-loc'] = () => {
        const v = geo.getValue();
        if (!(v.lat != null && v.lng != null)) { S.toast('حدّد موقعك على الخريطة بدقة (استخدم موقعي الحالي أو ابحث عن العنوان)', 'error'); return; }
        const updated = M.seller.save({ address: v, latitude: v.lat, longitude: v.lng });
        if (window.NasaqCloud && updated) {
          window.NasaqCloud.syncStore(updated).then((res) => {
            if (res) S.toast('تم حفظ موقع المتجر — سيظهر متجرك الآن للمشترين القريبين منه');
            else S.toast('تعذّر حفظ الموقع في القاعدة، حاول مرة أخرى', 'error');
          });
        } else {
          S.toast('تم حفظ الموقع محلياً فقط (لا يوجد اتصال بالخادم الآن)', 'error');
        }
      };
    }
    return { html, mount };
  };
  S.actions['st-delete'] = (b) => { if (!armed(b, 'تأكيد الحذف النهائي')) return; M.seller.reset(); location.hash = ''; location.reload(); };
})();
