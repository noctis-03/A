/*
 * 화면 크기별 손맛 비교: 여러 기기 크기에서 '화면 속 웍 크기 기준으로 같은 손동작'을 했을 때
 * 웍이 움직인 거리와 기름 흔들기 판정 속도가 같은지 표로 보여 준다.
 *
 * 실행:
 *   npm run dev            (다른 터미널에서, 개발 서버에서만 window.__game 이 열린다)
 *   npm i -D playwright && npx playwright install chromium   (처음 한 번)
 *   GAME_URL=http://localhost:5173/ node scripts/feel-check.cjs
 *
 * 기대값: wokMoveCm 와 oilMs 가 모든 행에서 같다 (oldWokMoveCm · oilOldHs 는 예전 방식, 비교용).
 * timeRatio 는 fps 가 10 이상일 때 1 에 가까워야 한다 (그 아래는 의도된 슬로모션).
 */
// 같은 '화면 속 웍 기준' 손동작이 기기마다 같은 결과를 내는지 측정
const { chromium, devices } = require('playwright');
const cases = [
  ['PC 1280x720', { viewport: { width: 1280, height: 720 } }],
  ['PC 1920x1080', { viewport: { width: 1920, height: 1080 } }],
  ['iPhone 13 세로', devices['iPhone 13']],
  ['iPhone 13 가로', devices['iPhone 13 landscape']],
  ['Pixel 7 세로', devices['Pixel 7']],
];
(async () => {
  const b = await chromium.launch({ args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const rows = [];
  for (const [name, opt] of cases) {
    const ctx = await b.newContext(opt); const p = await ctx.newPage();
    p.on('pageerror', e => console.log('ERR', name, e.message));
    await p.addInitScript(() => { localStorage.setItem('woktruck.save.v1', JSON.stringify({v:1,round:3,phase:'research',money:0,found:['scallion-egg','kimchi'],best:0})); localStorage.setItem('woktruck.quality', 'low'); });
    await p.goto((process.env.GAME_URL || 'http://localhost:5173/')); await p.waitForTimeout(6000);
    await p.click('text=이어서 하기', { timeout: 120000 }); await p.waitForTimeout(14000);
    // 화면 속 웍 중심 · 림 반지름(px)
    const geo = await p.evaluate(() => {
      const g = window.__game; const c = g.camera; c.updateMatrixWorld();
      const W = innerWidth, H = innerHeight;
      const px = (v) => { const q = v.clone().project(c); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
      const ctr = g.wok.base.clone().setY(1.0); const a = px(ctr), r = px(ctr.clone().setX(0.27));
      return { W, H, cx: a[0], cy: a[1], rimPx: Math.hypot(r[0] - a[0], r[1] - a[1]), mppAim: g.metersPerPx(g.aimPoint) };
    });
    // 웍을 잡고 '화면 속 웍 반지름의 절반'만큼 오른쪽으로 끈다 (실제 포인터 이벤트)
    const d = geo.rimPx * 0.5;
    await p.mouse.move(geo.cx, geo.cy); await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(geo.cx + d * i / 10, geo.cy);
    const tx = await p.evaluate(() => window.__game.wok.target.x);
    await p.mouse.up();
    // 기름: '1초에 화면 속 웍 지름 4번' 흔드는 속도 → 게임이 판정하는 속도
    const shakePx = geo.rimPx * 2 * 4;
    const newMs = shakePx * geo.mppAim;
    const oldHs = shakePx / geo.H; // 예전 방식 (화면 높이/초)
    // 시간: 게임 시간이 실제 시간을 따라가는지
    const tm = await p.evaluate(() => new Promise(r => { const g = window.__game; const t0 = g.time, r0 = performance.now(); let n = 0; const f = () => { n++; if (performance.now() - r0 < 4000) requestAnimationFrame(f); else r({ ratio: (g.time - t0) / ((performance.now() - r0) / 1000), fps: n / 4 }); }; requestAnimationFrame(f); }));
    rows.push({ name, W: geo.W, H: geo.H, rimPx: Math.round(geo.rimPx), wokMoveCm: +(tx * 100).toFixed(1), oldWokMoveCm: +(1.15 / geo.H * d * 100).toFixed(1), oilMs: +newMs.toFixed(2), oilOldHs: +oldHs.toFixed(2), fps: +tm.fps.toFixed(1), timeRatio: +tm.ratio.toFixed(2) });
    await ctx.close();
  }
  console.table(rows);
  await b.close();
})();
