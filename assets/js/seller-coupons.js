/* ==========================================================================
   js/seller-coupons.js — لوحة البائع: كوبونات الخصم الخاصة بمتجري
   البيانات في جدول public.coupons (Supabase) — الكوبون بيتطبّق في المتجر على منتجات متجرك بس.
   الصلاحيات (RLS): البائع يقرا ويعدّل كوبونات متجره هو فقط.
   ========================================================================== */
(function () {
  'use strict';
  const S = window.Seller;
  if (!S) return;
  const { M, esc, money, ic, $, $$, dateAr, pill, empty, card, pageHead, armed, fld } = S;
  const CFG = window.Store.config;
  const TYPES = { percent: 'نسبة مئوية %', fixed: 'مبلغ ثابت', shipping: 'شحن مجاني' };

  const sb = () => window.sb;
  const storeId = () => { const s = M.seller.get(); return s && s.cloudId; };
  let rows = null, loadErr = '';

  function load() {
    if (!sb() || !storeId()) { rows = []; loadErr = 'لازم يكون متجرك معتمد ومتصل بقاعدة البيانات.'; return Promise.resolve(); }
    return sb().from('coupons').select('*').eq('store_id', storeId()).order('created_at', { ascending: false })
      .then((r) => {
        if (r.error) {
          rows = [];
          loadErr = /relation .*coupons|does not exist|schema cache/i.test(r.error.message)
            ? 'جدول الكوبونات لسه ما اتعملش — شغّل ملف database/coupons_campaigns.sql في Supabase.' : r.error.message;
        } else { rows = r.data || []; loadErr = ''; }
      });
  }

  const statusOf = (c) => {
    if (!c.active) return ['processing', 'متوقف'];
    if (c.ends_at && new Date(c.ends_at) < new Date()) return ['cancelled', 'منتهي'];
    if (c.starts_at && new Date(c.starts_at) > new Date()) return ['new', 'مجدول'];
    if (c.usage_limit && c.used_count >= c.usage_limit) return ['cancelled', 'استُنفد'];
    return ['completed', 'نشط'];
  };
  const valueText = (c) => c.type === 'percent' ? Number(c.value) + '%' : c.type === 'fixed' ? money(c.value) : 'شحن مجاني';

  function listHTML() {
    if (rows === null) return '<p class="hint">جارٍ التحميل…</p>';
    if (loadErr) return '<p class="dnote dnote--warn">' + ic('alert') + esc(loadErr) + '</p>';
    if (!rows.length) return empty({ icon: 'tag', title: 'لا توجد كوبونات بعد', text: 'أنشئ أول كود خصم لعملاء متجرك من النموذج.' });
    return '<div class="dtable-wrap"><table class="dtable"><thead><tr><th>الكود</th><th>الخصم</th><th>الحد الأدنى</th><th>الصلاحية</th><th>الاستخدام</th><th>الحالة</th><th><span class="sr-only">إجراء</span></th></tr></thead><tbody>' +
      rows.map((c) => { const st = statusOf(c); return '<tr><td><bdi dir="ltr"><strong>' + esc(c.code) + '</strong></bdi></td><td>' + esc(valueText(c)) + (c.max_discount ? '<small> (حتى ' + money(c.max_discount) + ')</small>' : '') + '</td>' +
        '<td>' + (Number(c.min_order) ? money(c.min_order) : '—') + '</td><td>' + (c.ends_at ? 'حتى ' + dateAr(new Date(c.ends_at)) : 'مفتوحة') + '</td>' +
        '<td>' + c.used_count + (c.usage_limit ? ' / ' + c.usage_limit : '') + '</td><td>' + pill(st[0], st[1]) + '</td>' +
        '<td class="acts"><button type="button" class="btn btn--ghost btn--sm" data-act="cp-toggle" data-id="' + c.id + '">' + (c.active ? 'إيقاف' : 'تفعيل') + '</button> ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="cp-del" data-id="' + c.id + '">حذف</button></td></tr>'; }).join('') + '</tbody></table></div>';
  }
  const refreshList = () => { const el = $('#cp-list'); if (el) el.innerHTML = listHTML(); };

  S.views.coupons = () => {
    const html =
      pageHead('الكوبونات', 'أكواد خصم لعملاء متجرك — بتتطبّق على منتجات متجرك بس') +
      '<div class="dgrid dgrid--form"><form class="dcard dform" id="cp-form" novalidate autocomplete="off">' +
        '<h2 class="dcard__t">كوبون جديد</h2>' +
        fld('cp-code', 'الكود *', '<input class="input" id="cp-code" dir="ltr" maxlength="20" placeholder="EID20" style="text-transform:uppercase">', 'حروف إنجليزية وأرقام و - _ فقط (3 إلى 20)') +
        fld('cp-type', 'نوع الخصم', '<select class="select" id="cp-type">' + Object.keys(TYPES).map((k) => '<option value="' + k + '">' + TYPES[k] + '</option>').join('') + '</select>') +
        '<div data-cp="value">' + fld('cp-value', 'قيمة الخصم *', '<input class="input" id="cp-value" inputmode="decimal" dir="ltr" placeholder="10">', '<span data-cp-hint>النسبة من 1 إلى 100</span>') + '</div>' +
        '<div data-cp="max">' + fld('cp-max', 'أقصى خصم (' + CFG.currency + ')', '<input class="input" id="cp-max" inputmode="decimal" dir="ltr" placeholder="اختياري">', 'سقف للنسبة المئوية') + '</div>' +
        '<div class="dform__row">' +
          fld('cp-min', 'الحد الأدنى للطلب', '<input class="input" id="cp-min" inputmode="decimal" dir="ltr" placeholder="0">') +
          fld('cp-limit', 'عدد مرات الاستخدام', '<input class="input" id="cp-limit" inputmode="numeric" dir="ltr" placeholder="غير محدود">') + '</div>' +
        fld('cp-ends', 'ينتهي في', '<input class="input" id="cp-ends" type="date" dir="ltr">', 'اتركه فاضي لو من غير تاريخ انتهاء') +
        fld('cp-label', 'وصف يظهر للعملاء', '<input class="input" id="cp-label" maxlength="80" placeholder="خصم 20% بمناسبة العيد">') +
        '<p class="field__error" id="cp-error" role="alert"></p>' +
        '<div class="dform__foot"><button class="btn btn--primary" type="submit">إضافة الكوبون</button></div>' +
      '</form><div class="dcol">' + card('كوبونات متجرك', '<div id="cp-list">' + listHTML() + '</div>') + '</div></div>';

    function mount(root) {
      const type = $('#cp-type', root);
      const sync = () => {
        const t = type.value;
        $('[data-cp="value"]', root).hidden = t === 'shipping';
        $('[data-cp="max"]', root).hidden = t !== 'percent';
        const h = $('[data-cp-hint]', root); if (h) h.textContent = t === 'percent' ? 'النسبة من 1 إلى 100' : 'المبلغ بـ ' + CFG.currency;
      };
      type.addEventListener('change', sync); sync();

      $('#cp-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#cp-error', root), g = (id) => $('#' + id, root).value.trim();
        const num = (v) => { const n = Number(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); return isFinite(n) ? n : NaN; };
        const code = g('cp-code').toUpperCase(), t = type.value;
        const value = t === 'shipping' ? 0 : num(g('cp-value'));
        const min = g('cp-min') ? num(g('cp-min')) : 0, max = g('cp-max') ? num(g('cp-max')) : null;
        const limit = g('cp-limit') ? parseInt(g('cp-limit'), 10) : null;
        const bad = !/^[A-Z0-9_-]{3,20}$/.test(code) ? 'الكود لازم يكون 3 إلى 20 حرف/رقم إنجليزي' :
          t !== 'shipping' && !(value > 0) ? 'أدخل قيمة خصم صحيحة' :
          t === 'percent' && value > 100 ? 'النسبة لا تزيد عن 100' :
          !(min >= 0) ? 'الحد الأدنى غير صحيح' : (max !== null && !(max > 0)) ? 'أقصى خصم غير صحيح' :
          (limit !== null && !(limit > 0)) ? 'عدد الاستخدامات غير صحيح' :
          g('cp-ends') && new Date(g('cp-ends') + 'T23:59:59') < new Date() ? 'تاريخ الانتهاء لازم يكون في المستقبل' : '';
        if (bad) { err.textContent = bad; return; }
        if (!storeId() || !sb()) { err.textContent = 'متجرك غير متصل بقاعدة البيانات.'; return; }
        err.textContent = '';
        const label = g('cp-label') || (t === 'percent' ? 'خصم ' + value + '%' : t === 'fixed' ? 'خصم ' + value + ' ' + CFG.currency : 'شحن مجاني');
        const row = {
          code, type: t, value, min_order: min, max_discount: t === 'percent' ? max : null, label, store_id: storeId(),
          ends_at: g('cp-ends') ? new Date(g('cp-ends') + 'T23:59:59').toISOString() : null, usage_limit: limit, active: true
        };
        const btn = $('button[type=submit]', root); btn.disabled = true;
        const r = await sb().from('coupons').insert(row);
        btn.disabled = false;
        if (r.error) { err.textContent = r.error.code === '23505' ? 'الكود ده مستخدم قبل كده، اختار كود تاني.' : r.error.message; return; }
        S.toast('تمت إضافة الكوبون ' + code);
        $('#cp-form', root).reset(); sync();
        await load(); refreshList();
      });

      load().then(refreshList);
    }
    return { html, mount, title: 'الكوبونات' };
  };

  S.actions['cp-toggle'] = async (b) => {
    const c = (rows || []).find((x) => x.id === b.dataset.id); if (!c) return;
    const r = await sb().from('coupons').update({ active: !c.active, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (r.error) { S.toast(r.error.message, 'error'); return; }
    S.toast(c.active ? 'تم إيقاف الكوبون' : 'تم تفعيل الكوبون');
    await load(); refreshList();
  };
  S.actions['cp-del'] = async (b) => {
    if (!armed(b, 'تأكيد الحذف')) return;
    const r = await sb().from('coupons').delete().eq('id', b.dataset.id);
    if (r.error) { S.toast(r.error.message, 'error'); return; }
    S.toast('تم حذف الكوبون');
    await load(); refreshList();
  };
})();
