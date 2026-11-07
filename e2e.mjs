// End-to-end smoke + interaction tests in a real Chromium. Run: npm run build && npm run test:e2e
// Set SHOTS=/some/dir to also save screenshots for visual review.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { loadContent } from './lib.mjs';

const PORT = 4799;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const c = loadContent();
const server = await startServer(PORT);
const browser = await chromium.launch();

const failures = [];
const passes = [];
const check = (name, ok, detail = '') => { (ok ? passes : failures).push(`${name}${ok ? '' : ` — ${detail}`}`); };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar-EG', ...opts });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(NAME_NOT_RESOLVED|CONNECTION|TUNNEL|FAILED)|Failed to load resource/.test(m.text())) page.__errors.push(`console: ${m.text()}`); });
  return { ctx, page };
}
const go = async (page, hash) => { await page.goto(`${BASE}#${hash}`); await page.waitForSelector('main#main > *'); await page.waitForTimeout(40); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

// ---------------------------------------------------------------------------------------------
{
  const { ctx, page } = await newPage();

  // ---- Shell ----
  await go(page, '/');
  check('html lang=ar dir=rtl', (await page.getAttribute('html', 'lang')) === 'ar' && (await page.getAttribute('html', 'dir')) === 'rtl');
  check('home headline + both CTAs', (await page.locator('.hero h1').count()) === 1 && (await page.getByRole('link', { name: 'استكشف المؤشرات' }).count()) >= 1 && (await page.getByRole('link', { name: 'ابدأ التعلّم' }).count()) >= 1);
  check('home shows 6 perspective cards with counts 18/8/11/18/12/8', JSON.stringify(await page.locator('.persp-card .persp-count').allInnerTexts().then((a) => a.map((t) => parseInt(t)))) === '[18,8,11,18,12,8]');
  check('home featured section has 3 KPIs', (await page.locator('.feat').count()) === 3);
  check('home has 10 goal links', (await page.locator('.goal-grid a.goal-btn').count()) === 10);
  check('home chain visual tabs switch content', await (async () => {
    const before = await page.locator('.chain-steps').innerText();
    await page.locator('.chain-tabs button').nth(1).click();
    return (await page.locator('.chain-steps').innerText()) !== before;
  })());
  await shot(page, '01-home-light');

  // ---- Theme ----
  await page.getByRole('button', { name: /الوضع الداكن/ }).click();
  check('theme toggles to dark', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await shot(page, '02-home-dark');
  await page.reload();
  check('theme persists after reload', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.getByRole('button', { name: /الوضع الفاتح/ }).click();

  // ---- Explorer ----
  await go(page, '/explorer');
  check('explorer lists all 75 by default', (await page.locator('.kpi-card').count()) === 75);
  check('explorer first card is #01 (book order)', (await page.locator('.kpi-card .kpi-num').first().innerText()).trim() === '01');
  await page.locator('#kpi-q').fill('هامش');
  const nMargin = await page.locator('.kpi-card').count();
  check('search Arabic "هامش" narrows results', nMargin > 0 && nMargin < 75, `got ${nMargin}`);
  check('result count text updates', /عرض \d+ من 75/.test(await page.locator('.result-bar .count').innerText()));
  await page.locator('#kpi-q').fill('ROI');
  check('search acronym "ROI" finds Return on investment', (await page.locator('.kpi-card h3').allInnerTexts()).some((t) => /العائد على الاستثمار/.test(t)));
  await page.locator('#kpi-q').fill('NPS');
  check('search acronym "NPS"', (await page.locator('.kpi-card').count()) >= 1);
  await page.locator('#kpi-q').fill('conversion');
  check('search English name', (await page.locator('.kpi-card').count()) >= 1);
  await page.locator('#kpi-q').fill('zzzzqq');
  check('empty state shown for no match', (await page.locator('.empty h3').innerText()).includes('لا توجد') && (await page.locator('.kpi-card').count()) === 0);
  await shot(page, '03-explorer-empty');
  await page.getByRole('button', { name: 'إعادة ضبط البحث' }).click();
  check('reset restores 75', (await page.locator('.kpi-card').count()) === 75);
  for (const [pid, n] of [['financial', 18], ['customer', 8], ['marketing', 11], ['operations', 18], ['employee', 12], ['csr', 8]]) {
    await go(page, `/explorer?p=${pid}`);
    check(`filter perspective ${pid} = ${n}`, (await page.locator('.kpi-card').count()) === n, `got ${await page.locator('.kpi-card').count()}`);
  }
  await go(page, '/explorer');
  await page.locator('#topic').selectOption({ index: 2 });
  const nTopic = await page.locator('.kpi-card').count();
  check('topic filter narrows', nTopic > 0 && nTopic < 75, `got ${nTopic}`);
  await go(page, '/explorer');
  await page.locator('#sort').selectOption('ar');
  const arNames = await page.locator('.kpi-card h3').allInnerTexts();
  check('alphabetical (Arabic) sort is ordered', arNames.length === 75 && arNames.every((n, i) => i === 0 || arNames[i - 1].localeCompare(n, 'ar') <= 0));
  await page.locator('#sort').selectOption('en');
  const enNames = await page.locator('.kpi-card .en').allInnerTexts();
  check('alphabetical (English) sort is ordered', enNames.length === 75 && enNames.every((n, i) => i === 0 || enNames[i - 1].replace(/ ·.*/, '').localeCompare(n.replace(/ ·.*/, ''), 'en', { sensitivity: 'base' }) <= 0));
  await page.getByRole('button', { name: /قائمة/ }).click();
  check('list view shows 75 rows', (await page.locator('.kpi-row').count()) === 75);
  await shot(page, '04-explorer-list');
  // header search shortcut focuses input
  await page.getByRole('link', { name: 'بحث في المؤشرات' }).click();
  await page.waitForTimeout(100);
  check('header search icon focuses the search box', await page.evaluate(() => document.activeElement?.id === 'kpi-q'));
  // favourite from a card
  await go(page, '/explorer');
  await page.locator('.kpi-card .fav').first().click();
  check('favourite toggles from card + header badge', (await page.locator('.badge-count').innerText()).trim() === '1');
  await shot(page, '05-explorer-cards');

  // ---- Detail pages: all 75 ----
  let detailOk = 0;
  for (const k of c.kpis) {
    await go(page, `/kpi/${k.id}`);
    const h1 = await page.locator('.detail-head h1').innerText();
    const num = await page.locator('.detail-head .detail-meta .kpi-num').innerText();
    const hasCalc = (await page.locator('.calc').count()) === 1;
    const hasWs = (await page.locator('.worksheet').count()) === 1;
    const txt = await bodyText(page);
    const sane = h1.trim() === k.nameAr && num.includes(String(k.originalNumber).padStart(2, '0')) && (k.formula.type === 'calculator' ? hasCalc && !hasWs : hasWs && !hasCalc) && !/NaN|Infinity|undefined|\[object/.test(txt);
    if (sane) detailOk++; else check(`detail ${k.id}`, false, `h1="${h1}" num="${num}" calc=${hasCalc} ws=${hasWs}`);
    const prevNext = await page.locator('.pager a').count();
    const expected = (k.originalNumber > 1 ? 1 : 0) + (k.originalNumber < 75 ? 1 : 0);
    if (prevNext !== expected) check(`pager ${k.id}`, false, `got ${prevNext} expected ${expected}`);
    // required content blocks
    for (const sel of ['.big-q', '.formula', '#s-interpret', '#s-data', '#s-limits', '#s-source']) {
      if ((await page.locator(sel).count()) < 1) check(`detail ${k.id} has ${sel}`, false, 'missing');
    }
  }
  check(`all 75 detail pages render with correct title/number/tool`, detailOk === 75, `${detailOk}/75`);
  check('no page errors while visiting 75 details', page.__errors.length === 0, page.__errors.slice(0, 3).join(' | '));

  // ---- Calculators: every calculator KPI + every variant runs from its example ----
  let calcRuns = 0;
  for (const k of c.kpis.filter((x) => x.formula.type === 'calculator')) {
    await go(page, `/kpi/${k.id}`);
    const variants = await page.locator('.variant-group input[type=radio]').count();
    const loops = Math.max(1, variants);
    for (let v = 0; v < loops; v++) {
      if (variants) await page.locator('.variant-group input[type=radio]').nth(v).check();
      await page.getByRole('button', { name: /تحميل مثال/ }).click();
      const val = (await page.locator('.result-value').innerText().catch(() => '')).trim();
      const tagged = (await page.locator('.example-tag').count()) === 1;
      const steps = await page.locator('.calc .steps li').count();
      if (val && !/NaN|Infinity/.test(val) && tagged && steps > 0) calcRuns++;
      else check(`calculator ${k.id} variant ${v}`, false, `value="${val}" tagged=${tagged} steps=${steps}`);
    }
  }
  check(`calculators (incl. variants) produce a value, an "illustrative" tag and steps`, failures.every((f) => !f.startsWith('calculator ')), `${calcRuns} runs`);

  // ---- Calculator validation behaviour (net profit margin) ----
  await go(page, '/kpi/net-profit-margin');
  const inputs = page.locator('.calc-inputs input.input[type=text]');
  check('empty calculator shows prompt, no result', (await page.locator('.result-empty').count()) === 1 && (await page.locator('.result-value').count()) === 0);
  await inputs.nth(0).fill('50000');
  check('partial input asks for missing fields', (await page.locator('.result-empty').innerText()).includes('أكمل'));
  await inputs.nth(1).fill('0');
  check('zero denominator handled with a clear message', (await page.locator('.result-error').count()) === 1 && (await page.locator('.result-value').count()) === 0);
  await inputs.nth(1).fill('abc');
  check('non-numeric input flagged on the field', (await page.locator('.calc-inputs .err').count()) >= 1);
  await inputs.nth(1).fill('500,000');
  check('thousands separators accepted; result 10%', (await page.locator('.result-value').innerText()).includes('10%') && (await page.locator('.real-tag').count()) === 1);
  await inputs.nth(1).fill('٥٠٠٠٠٠');
  check('Arabic-Indic digits accepted', (await page.locator('.result-value').innerText()).includes('10%'));
  await inputs.nth(1).fill('-10');
  check('negative revenue rejected', (await page.locator('.calc-inputs .err').count()) >= 1);
  await page.getByRole('button', { name: /مسح الحقول/ }).click();
  check('clear resets fields and result', (await page.locator('.result-value').count()) === 0 && (await inputs.nth(0).inputValue()) === '');
  await page.getByRole('button', { name: /تحميل مثال/ }).click();
  await page.locator('#t-net-profit-margin, .target-box input').first().fill('15');
  check('target comparison reports gap in percentage points', /نقطة مئوية/.test(await page.locator('.gap-bar').innerText()));
  await shot(page, '06-detail-net-profit-margin');

  // ---- Worksheet persistence + notes + collections ----
  await go(page, '/kpi/klout-score');
  await page.locator('.ws-row textarea').first().fill('اختبار ورقة العمل');
  await page.reload();
  check('worksheet answer persists after reload', (await page.locator('.ws-row textarea').first().inputValue()) === 'اختبار ورقة العمل');
  await shot(page, '07-detail-worksheet');
  await go(page, '/kpi/net-profit');
  await page.locator('#note').fill('ملاحظة تجريبية');
  await page.locator('.info-card input[placeholder*="مجموعة"]').fill('تقرير الإدارة');
  await page.getByRole('button', { name: /إنشاء وإضافة/ }).click();
  // #1 was already saved from its card in the explorer step, so the button must read "محفوظ" and be pressed.
  check('detail save button reflects the saved state (pressed)', (await page.locator('.detail-actions .btn').first().getAttribute('aria-pressed')) === 'true');
  await go(page, '/workspace');
  const wsText = await bodyText(page);
  check('workspace shows saved KPI, collection and note', wsText.includes('صافي الربح') && wsText.includes('تقرير الإدارة') && wsText.includes('ملاحظة تجريبية'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /تصدير \(Markdown\)/ }).click()]);
  const dlText = fs.readFileSync(await dl.path(), 'utf8');
  check('workspace export downloads Markdown with source labels', dlText.includes('Bernard Marr') && dlText.includes('[من الكتاب]') && dlText.includes('ملاحظة تجريبية'));
  await shot(page, '08-workspace');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /حذف/ }).first().click();
  check('collection can be deleted', (await page.locator('.coll').count()) === 0);
  await page.getByRole('button', { name: /مسح كل بياناتي/ }).click();
  await page.getByRole('button', { name: /نعم، امسح/ }).click();
  check('reset-all clears favourites', (await page.locator('.badge-count').count()) === 0);

  // ---- Goals ----
  await go(page, '/goals');
  check('goals page: prompt before selection', (await page.locator('.goal-panel').count()) === 0 && (await page.locator('.goal-btn').count()) === 10);
  for (const g of c.goals) {
    await go(page, `/goals?goal=${g.id}`);
    const n = await page.locator('.goal-kpi').count();
    const flow = await page.locator('.flow li').count();
    if (n !== g.kpiIds.length || flow !== 6) check(`goal ${g.id}`, false, `kpis ${n}/${g.kpiIds.length} flow ${flow}`);
  }
  check('all 10 goals render KPI list + 6-step flow', !failures.some((f) => f.startsWith('goal ')));
  await go(page, '/goals');
  await page.locator('.goal-btn').nth(3).click();
  check('clicking a goal reveals its panel', (await page.locator('.goal-panel').count()) === 1 && (await page.locator('.notice').innerText()).includes('تذكير'));
  await shot(page, '09-goals');

  // ---- Compare ----
  for (const cmp of c.comparisons) {
    await go(page, `/compare?c=${cmp.id}`);
    const cols = await page.locator('.cmp thead th').count();
    if (cols !== cmp.kpiIds.length + 1) check(`compare ${cmp.id}`, false, `cols ${cols}`);
  }
  check('all 6 preset comparisons render', !failures.some((f) => f.startsWith('compare ')));
  await shot(page, '10-compare-preset');
  await go(page, '/compare');
  await page.getByRole('button', { name: 'اختر بنفسك' }).click();
  await page.locator('#slot-0').selectOption('gross-profit-margin');
  await page.locator('#slot-1').selectOption('operating-profit-margin');
  check('custom compare builds 2-KPI table', (await page.locator('.cmp thead th').count()) === 3);
  await page.locator('#slot-2').selectOption('ebitda');
  check('custom compare supports 3 KPIs', (await page.locator('.cmp thead th').count()) === 4);
  await shot(page, '11-compare-custom');

  // ---- Learn ----
  await go(page, '/learn');
  check('learn index lists 8 modules', (await page.locator('.learn-card').count()) === 8);
  for (const m of c.learning) {
    await go(page, `/learn/${m.id}`);
    const secs = await page.locator('.module .section-block').count();
    const qs = await page.locator('.q-item').count();
    if (secs !== m.sections.length || qs !== m.quiz.length) check(`learn ${m.id}`, false, `sections ${secs} quiz ${qs}`);
    const diagrams = m.sections.filter((s) => s.diagram).length;
    if ((await page.locator('.diagram svg[role=img]').count()) !== diagrams) check(`learn ${m.id} diagrams`, false, 'diagram count');
  }
  check('all 8 modules render sections, quiz and accessible diagrams', !failures.some((f) => f.startsWith('learn ')));
  await go(page, '/learn/percent-vs-points');
  await shot(page, '12-learn-module');
  const q0 = c.learning.find((m) => m.id === 'percent-vs-points').quiz[0];
  await page.locator('.q-item').first().locator('input').nth(q0.answer).check();
  check('quiz marks the right answer', (await page.locator('.q-feedback.ok').count()) === 1);
  await page.locator('.q-item').nth(1).locator('input').nth(c.learning.find((m) => m.id === 'percent-vs-points').quiz[1].answer === 0 ? 1 : 0).check();
  check('quiz marks a wrong answer', (await page.locator('.q-feedback.no').count()) === 1);
  await page.getByRole('button', { name: /إعادة الاختبار/ }).click();
  check('quiz can be reset', (await page.locator('.q-feedback').count()) === 0);

  // ---- Glossary / About ----
  await go(page, '/glossary');
  check('glossary lists all terms', (await page.locator('.gl-item').count()) === c.glossary.length);
  await page.locator('#gl-q').fill('benchmark');
  check('glossary search by English', (await page.locator('.gl-item').count()) >= 1 && (await page.locator('.gl-item').count()) < c.glossary.length);
  await page.getByRole('button', { name: /فهرس المؤشرات/ }).click();
  await page.locator('#gl-q').fill('ROCE');
  check('KPI index searchable by acronym', (await page.locator('.kpi-row').count()) >= 1);
  await go(page, '/about');
  check('about page lists the flagged KPIs', (await page.locator('.info-card.warn').count()) === c.kpis.filter((k) => k.verificationStatus === 'needs-verification').length);
  await shot(page, '13-about');

  // ---- Unknown routes ----
  await go(page, '/kpi/does-not-exist');
  check('unknown KPI → not-found page', (await page.locator('.empty h3').innerText()).includes('لم نعثر'));
  await go(page, '/nope');
  check('unknown route → not-found page', (await page.locator('.empty h3').count()) === 1);

  // ---- Link integrity: every internal href on key pages resolves ----
  const bad = [];
  for (const route of ['/', '/explorer', '/goals?goal=reduce-churn', '/learn', '/compare', '/glossary', '/about', '/kpi/net-profit-margin']) {
    await go(page, route);
    const hrefs = await page.locator('a[href^="#/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    for (const h of hrefs) {
      const p = h.slice(1).split('?')[0].split('/').filter(Boolean);
      const [a, b] = p;
      const known = !a || ['explorer', 'goals', 'learn', 'compare', 'workspace', 'glossary', 'about'].includes(a) || a === 'kpi';
      const okKpi = a !== 'kpi' || c.kpis.some((k) => k.id === b);
      const okMod = a !== 'learn' || !b || c.learning.some((m) => m.id === b);
      if (!known || !okKpi || !okMod) bad.push(`${route} → ${h}`);
    }
  }
  check('no broken internal links on key pages', bad.length === 0, bad.slice(0, 5).join(' | '));

  check('no console/page errors across the desktop session', page.__errors.length === 0, page.__errors.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Mobile: layout, navigation drawer, no horizontal overflow
{
  const { ctx, page } = await newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
  const routes = ['/', '/explorer', '/kpi/net-profit-margin', '/kpi/klout-score', '/goals?goal=improve-profitability', '/learn/percent-vs-points', '/compare?c=roi-vs-roce', '/glossary', '/about', '/workspace'];
  for (const r of routes) {
    await go(page, r);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(`mobile no horizontal overflow ${r}`, o.sw <= o.cw + 1, `scrollWidth ${o.sw} > ${o.cw}`);
  }
  await go(page, '/');
  check('desktop nav hidden on mobile, menu button visible', !(await page.locator('.nav-links').isVisible()) && (await page.locator('.menu-toggle').isVisible()));
  await page.locator('.menu-toggle').click();
  check('mobile drawer opens', await page.locator('#mobile-nav').isVisible());
  await page.keyboard.press('Escape');
  check('Escape closes the drawer', !(await page.locator('#mobile-nav').isVisible()));
  await page.locator('.menu-toggle').click();
  await page.locator('#mobile-nav a', { hasText: 'مكتبة المؤشرات' }).click();
  await page.waitForURL(/#\/explorer$/);
  await page.waitForSelector('#mobile-nav', { state: 'detached' });
  check('drawer link navigates and closes', page.url().endsWith('#/explorer') && (await page.locator('#mobile-nav').count()) === 0);
  await go(page, '/');
  await shot(page, '20-mobile-home');
  await go(page, '/kpi/net-profit-margin');
  await page.getByRole('button', { name: /تحميل مثال/ }).click();
  await shot(page, '21-mobile-detail');
  await go(page, '/explorer');
  await shot(page, '22-mobile-explorer');
  check('no errors on mobile session', page.__errors.length === 0, page.__errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Accessibility basics + reduced motion + storage-blocked resilience
{
  const { ctx, page } = await newPage({ reducedMotion: 'reduce' });
  await go(page, '/explorer');
  await page.keyboard.press('Tab');
  check('skip link is the first focus stop', await page.evaluate(() => document.activeElement?.className === 'skip-link'));
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter((el) => {
    const id = el.id; const lab = id && document.querySelector(`label[for="${id}"]`);
    return !lab && !el.getAttribute('aria-label') && !el.closest('label');
  }).length);
  check('every form control has an accessible label (explorer)', unlabeled === 0, `${unlabeled} unlabeled`);
  await go(page, '/kpi/gross-profit-margin');
  const unl2 = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter((el) => {
    const id = el.id; const lab = id && document.querySelector(`label[for="${id}"]`);
    return !lab && !el.getAttribute('aria-label') && !el.closest('label');
  }).length);
  check('every form control has an accessible label (detail)', unl2 === 0, `${unl2} unlabeled`);
  const heads = await page.evaluate(() => document.querySelectorAll('h1').length);
  check('exactly one h1 on detail page', heads === 1, `${heads}`);
  const noName = await page.evaluate(() => [...document.querySelectorAll('button, a')].filter((el) => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).length);
  check('no unnamed buttons/links', noName === 0, `${noName}`);
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const p2 = await ctx2.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(`${BASE}#/kpi/net-profit`);
  await p2.waitForSelector('.detail-head h1');
  await p2.getByRole('button', { name: /احفظ المؤشر/ }).click();
  check('app still works when storage is blocked (saves in memory)', errs.length === 0 && (await p2.locator('.badge-count').count()) === 1, errs.join('|'));
  await p2.goto(`${BASE}#/workspace`);
  await p2.waitForSelector('.notice');
  await ctx2.close();
}

await browser.close();
server.close();

console.log(`\nPassed: ${passes.length}   Failed: ${failures.length}`);
if (failures.length) { console.error('\nFAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('✓ All end-to-end checks passed.');
