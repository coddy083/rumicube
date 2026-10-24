// Run against a local PHP server: NODE_PATH=<playwright packages> node tests/mobile.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.TILE_TEST_URL || 'http://127.0.0.1:8765';
const out = process.env.TILE_SCREENSHOTS || '/tmp/tile-mobile';
fs.mkdirSync(out, {recursive:true});
const colors = ['red','blue','black','orange'];
const fixture = () => ({
  code:'ABC234', revision:1, status:'playing', mode:'friends', capacity:3,
  me:'me', turnId:'me', hostId:'me', poolCount:14, lastEvent:'내 차례가 시작됐어요.',
  players:[{id:'me',name:'열두글자닉네임테스트입니다',registered:true,online:true,count:30},
    {id:'friend',name:'이름이아주긴친구테스트',registered:false,online:true,count:14},
    {id:'bot',name:'컴퓨터',registered:true,online:true,bot:true,count:14}],
  rack:Array.from({length:30},(_,i)=>({id:`rack-${i}`,color:colors[i%4],number:i%13+1})),
  board:[{id:'long-run',tiles:Array.from({length:13},(_,i)=>({id:`board-${i}`,color:'blue',number:i+1}))}]
});
async function fits(page, label) {
  const issues = await page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push('root overflow');
    for (const el of document.querySelectorAll('button,input,select')) {
      const r=el.getBoundingClientRect();
      if(!r.width || !r.height) continue;
      // Deliberate local scrolling regions retain offscreen tiles in the DOM.
      if(el.closest('.rack-tiles,.meld-tiles,.selection-bar')) continue;
      if(r.left < -1 || r.right > innerWidth+1) problems.push(`offscreen ${el.textContent || el.id}`);
      if(innerWidth <=768 && el.tagName==='BUTTON' && (r.width<43.9 || r.height<43.9)) problems.push(`small target ${el.textContent}: ${r.width}x${r.height}`);
      if(el.tagName==='INPUT' && innerWidth <=768 && parseFloat(getComputedStyle(el).fontSize)<16) problems.push('input zoom risk');
    }
    return problems;
  });
  assert.deepEqual(issues,[],label);
}
async function swipe(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
  for(let step=1;step<=12;step++) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/12,y:from.y+(to.y-from.y)*step/12}]});
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(200);
  await cdp.detach();
}
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const width of [320,375,414,768,1280]) {
      const context=await browser.newContext({viewport:{width,height:width===1280?900:812},hasTouch:true,isMobile:width<=768});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      let state=fixture();
      await page.route('**/api/index.php*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('action')==='init'?{csrf:'fixture'}:state}));
      await page.goto(base);
      await page.locator('#nickname').waitFor();
      await fits(page,`home ${width}`);
      await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});
      await page.locator('#rules-button').click();
      await page.locator('dialog[open]').waitFor();
      await fits(page,`rules ${width}`);
      await page.locator('#close-modal').click();
      await page.locator('#nickname').fill('모바일테스트');
      await page.locator('#create-button').click();
      await page.locator('.rack-panel').waitFor();
      await fits(page,`game ${width}`);
      if(width<=768) {
        const sizes=await page.evaluate(()=>({rack:document.querySelector('.rack-panel').getBoundingClientRect().height,hand:document.querySelector('.rack-tiles').getBoundingClientRect().height}));
        assert(sizes.rack<420,`bounded rack ${width}: ${JSON.stringify(sizes)}`);
        assert(sizes.hand<=192,'bounded compact hand');
        const overview = await page.locator('.rack-tiles').evaluate(el=>{
          const bounds=el.getBoundingClientRect();
          const tiles=[...el.querySelectorAll('.tile')];
          const visible=tiles.filter(t=>{const r=t.getBoundingClientRect();return r.left>=bounds.left && r.right<=bounds.right && r.top>=bounds.top && r.bottom<=bounds.bottom;});
          return {visible:visible.length,rows:new Set(tiles.map(t=>t.offsetTop)).size};
        });
        assert(overview.rows<=4,'thirty tiles fit within four rows');
        assert.equal(overview.visible,30,`all thirty hand tiles visible at ${width}px`);
        const face=await page.locator('.rack-tiles .tile').first().evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,font:parseFloat(getComputedStyle(el).fontSize),symbol:getComputedStyle(el.querySelector('.symbol')).display}));
        assert(face.width>=28 && face.width<36 && face.height===38 && face.font>=23,'small tiles retain readable numbers');
        assert.equal(face.symbol,'none','game tiles show only color and number');
        const rack=page.locator('.rack-tiles');
        await rack.evaluate(el=>el.scrollTop=0);
        const before=await rack.evaluate(el=>el.scrollLeft);
        const visible=page.locator('.rack-tiles [data-action="tile"]').nth(10);
        await visible.tap();
        assert.equal(await rack.evaluate(el=>el.scrollLeft),before,'selection keeps hand position');
        assert.equal(await visible.getAttribute('aria-pressed'),'true');
        await page.locator('[data-action="clear-selection"]').tap();
        await rack.evaluate(el=>el.scrollLeft=0);
        const meld=page.locator('.meld-tiles').first();
        await meld.scrollIntoViewIfNeeded();
        const r=await meld.boundingBox();
        await swipe(page,{x:r.x+r.width-25,y:r.y+r.height/2},{x:r.x+25,y:r.y+r.height/2});
        const scrollable=await meld.evaluate(el=>el.scrollWidth>el.clientWidth);
        assert(!scrollable || await meld.evaluate(el=>el.scrollLeft)>20,'long meld retains horizontal touch scroll');
        assert.equal(await page.locator('.drag-ghost').count(),0,'swipe is not drag');
        await page.evaluate(()=>window.scrollBy(0,180));
        const tile=page.locator('.rack-tiles .tile').first();
        const from=await tile.boundingBox();
        const target=await page.locator('[data-new-meld]').boundingBox();
        await swipe(page,{x:from.x+from.width/2,y:from.y+from.height/2},{x:from.x+from.width/2,y:Math.max(10,target.y+target.height/2)});
        assert.equal(await page.locator('.rack-tiles .tile').count(),29,'vertical touch drag places a tile');
        await page.locator('[data-action="reset"]').tap();
        assert.equal(await page.locator('.rack-tiles .tile').count(),30,'reset restores hand');
      }
      await page.screenshot({path:`${out}/game-${width}.png`,fullPage:true});
      await page.screenshot({path:`${out}/game-viewport-${width}.png`});
      // Render sibling states using the real view functions and the same stylesheet.
      await page.evaluate(async()=>{
        const {lobby}=await import('/assets/js/views.js?v=20261020-mobile1');
        document.querySelector('#main').innerHTML=lobby({me:'me',hostId:'me',capacity:3,code:'ABC234',players:[{id:'me',name:'이름이아주긴테스트닉네임',online:true,ready:true}]});
      });
      await fits(page,`lobby ${width}`);
      await page.screenshot({path:`${out}/lobby-${width}.png`,fullPage:true});
      await page.evaluate(async()=>{
        const {result}=await import('/assets/js/views.js?v=20261020-mobile1');
        document.querySelector('#main').innerHTML=result({me:'me',capacity:3,players:[{id:'me',rematch:false}],result:{reason:'win',players:[
          {id:'me',name:'닉네임이아주긴우승자입니다',winner:true,remaining:0,score:123},
          {id:'friend',name:'친구',winner:false,remaining:123,score:-123}
        ]}});
      });
      await fits(page,`result ${width}`);
      assert.deepEqual(errors,[],'no runtime errors');
      console.log(`PASS ${width}px home, rules, game, lobby, result${width<=768?', touch scroll, drag, selection persistence':''}`);
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:812,height:375},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    await page.goto(base);
    await page.evaluate(async s=>{
      const {game}=await import('/assets/js/views.js?v=20261020-mobile1');
      const {Editor}=await import('/assets/js/board.js?v=20261020-mobile1');
      document.querySelector('#main').innerHTML=game(s,new Editor(s));
    },fixture());
    assert.equal(await page.locator('.rack-panel').evaluate(el=>getComputedStyle(el).position),'static');
    await fits(page,'landscape');
    await page.screenshot({path:`${out}/landscape.png`,fullPage:true});
    await context.close();
    console.log('PASS short landscape scrolls the whole hand');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
