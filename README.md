# نَسَق — لوحة البائع
`https://nosoq-seller.vercel.app`

```
nosoq-seller/
├─ index.html                 ← اللوحة (/)
├─ pages/become-seller.html   ← التسجيل (/become-seller)
├─ pages/application-status.html  ← حالة الطلب (/application-status)
├─ assets/  (css · js · img)
└─ vercel.json
```

## الربط مع باقي المنصات
الملف `assets/js/nasaq-links.js` هو المسؤول:
- أي رابط لصفحة متجر (`/shop` · `/store/..` · `/auth` ...) بيفتح على المتجر الرئيسي ومعاه الجلسة.
- لو غير مسجّل دخول: زر "تسجيل الدخول" بيودّيه لـ `main/auth?next=seller` وبعد الدخول بيرجع هنا مسجّل.
- **لو غيّرت أي دومين**: عدّل `NASAQ_LINKS` في أول الملف (وفي نسخته داخل المشروعين التانيين).

## النشر
Vercel: Framework = Other · Build/Output فاضيين.
