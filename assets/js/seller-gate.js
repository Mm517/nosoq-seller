/* ==========================================================================
   js/seller-gate.js — يبدأ فحص حالة متجر البائع (قيد المراجعة / مفعّل / مرفوض)
   فور تحميل الصفحة، بالتوازي مع باقي السكربتات. js/seller.js ينتظر هذا الفحص
   قبل عرض لوحة البائع، فلا تظهر بيانات المتجر الحقيقية إلا بعد اعتماد الإدمن.
   ========================================================================== */
window.NasaqSellerGateReady = (async function () {
  const TOKEN_KEY = 'nasaq_access_token_v1';
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return { status: 'signed-out' };
    const response = await fetch('/api/seller/me', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
    });
    if (response.status === 403) return { status: 'signed-out' };
    if (!response.ok) return { status: 'error' };
    const data = await response.json();
    if (!data || !data.store) return { status: 'no-store' };
    return { status: data.store.status || 'pending', store: data.store };
  } catch (_) {
    return { status: 'offline' };
  }
})();
