# مرصد المؤشرات — منصة تفاعلية لـ 75 مؤشر أداء رئيسي

منصة عربية (RTL) تحوّل مرجع الـ75 KPI المبني على تصنيف Bernard Marr (*Key Performance Indicators: The 75 Measures Every Manager Needs to Know*, Pearson, 2012) إلى تجربة تعلّم تفاعلية. واجهة بلا خادم: React + TypeScript، تُبنى بـ esbuild إلى ملفات ثابتة.

## التشغيل

```bash
npm install            # react, react-dom, react-icons, esbuild, typescript, playwright, @types/*
npm run validate       # يتحقق من المحتوى (75 مؤشرًا، الترقيم، المنظورات، المراجع، وتشغيل مثال كل حاسبة)
npm run build          # ينتج dist/ (app.js + app.css + index.html)
npm run serve          # يخدم dist/ على http://localhost:4173
npm run dev            # بناء مراقِب + خادم تطوير
npm run test:e2e       # اختبار شامل في Chromium (بعد npm run build)
npm run typecheck      # فحص الأنواع (يحتاج @types/react من npm install)
```

التوجيه عبر الـ hash (`#/kpi/net-profit-margin`) فيعمل على أي استضافة ثابتة دون إعدادات إعادة توجيه.
الخطوط تُحمَّل من Google Fonts؛ بدونها يعمل الموقع بخطوط النظام.

## البنية

```
content/                 المحتوى منفصل تمامًا عن الواجهة
  kpis/NN-id.json        مؤشر واحد في ملف مستقل (75 ملفًا) — يُحدَّث دون لمس غيره
  perspectives.json  goals.json  comparisons.json  glossary.json  learning.json
scripts/                 validate / build / serve / e2e
src/
  lib/calculators.ts     محرك الحاسبات (بيانات + دالة حساب نقية، 55 تعريفًا)
  lib/content.ts         الوصول للمحتوى والبحث (تطبيع عربي)
  components/            Layout, Calculator, Worksheet, KpiCard, Diagrams, Quiz…
  pages/                 Home, Explorer, KpiDetail, Goals, Learn, Compare, Workspace, Glossary, About
  state/                 router (hash) و store (حفظ محلي)
  styles/app.css         نظام التصميم (tokens، وضع فاتح/داكن)
```

لتحديث مؤشر: عدّل ملفه في `content/kpis/` ثم `npm run validate && npm run build`.

## نزاهة المصدر

- الأسماء والترقيم والمناظير وأرقام صفحات بداية كل فصل (`sourcePage`) تم التحقق منها لجميع المؤشرات الـ75 مقابل فهرس الكتاب.
- كل حقل موسوم: «من الكتاب» / «شرح تطبيقي» / «إضافة تطبيقية» / «يحتاج إلى تحقق» (`provenance`).
- لا معايير مقارنة صناعية، ولا متوسطات، ولا أرقام 2012 معروضة كمعايير حالية.
- 20 مؤشرًا بحالة `needs-verification` (تعريف متعدد أو أداة تاريخية)؛ قائمتها في صفحة «المصدر والمنهجية».

## حدود معروفة

- الحفظ (مفضلة، مجموعات، ملاحظات، أوراق عمل) في `localStorage` فقط: لا حسابات ولا مزامنة بين الأجهزة، وقد يُفقد بمسح بيانات الموقع. التصدير بصيغة Markdown متاح.
- الصيغ شائعة أو مبسطة؛ على المؤسسة تثبيت تعريفها قبل المقارنة.
- الواجهة عربية فقط؛ المحتوى مفصول ويستخدم خصائص CSS المنطقية لتسهيل نسخة إنجليزية لاحقًا.
