const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.TILE_TEST_URL || 'http://127.0.0.1:8765';
const out = process.env.TILE_SCREENSHOTS || '/tmp/tile-joker';
const tile = (color,number) => ({id:`${color}-${number}-0`,color,number,joker:false});
const fixture = () => ({code:'ABC234',revision:1,status:'playing',mode:'friends',capacity:2,me:'me',turnId:'me',hostId:'me',poolCount:14,
  players:[{id:'me',name:'하트테스트',registered:true,online:true,count:2},{id:'friend',name:'친구',registered:true,online:true,count:14}],
  rack:[{id:'joker-1',joker:true},tile('blue',1)],board:[
    {id:'old',tiles:[tile('red',7),tile('blue',7),tile('black',7),{id:'joker-0',joker:true,asColor:'orange',asNumber:7}]},
    {id:'target',tiles:[tile('red',10),tile('red',11),tile('red',12)]}
  ]});
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const width of [375,1280]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      const page = await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const state=fixture();let committed;
      await page.route('**/api/index.php*',route=>{
        const body=route.request().postDataJSON();
        if(body?.action==='commit') committed=body;
        return route.fulfill({json:new URL(route.request().url()).searchParams.get('action')==='init'?{csrf:'fixture'}:state});
      });
      await page.goto(base);
      await page.locator('#nickname').fill('하트테스트');
      await page.locator('#create-button').click();
      await page.locator('.rack-panel').waitFor();
      assert.equal(await page.locator('.joker-heart').count(),2);
      await page.screenshot({path:`${out}/hearts-${width}.png`,fullPage:true});
      const existing=page.locator('[data-id="joker-0"]');
      if (width===1280) {
        const from=await existing.boundingBox();
        const target=await page.locator('[data-group="target"] .meld-tiles').boundingBox();
        await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
        await page.mouse.down();
        await page.mouse.move(target.x+target.width-5,target.y+target.height/2,{steps:15});
        await page.mouse.up();
      } else {
        await existing.click();
        assert.equal(await page.locator('dialog[open]').count(),0);
        await page.locator('[data-group="target"] [data-action="append"]').click();
      }
      assert.equal(await page.locator('[data-group="target"] [data-id="joker-0"]').count(),1);
      await page.locator('[data-id="joker-1"]').click();
      assert.equal(await page.locator('dialog[open]').count(),0);
      await page.locator('[data-group="old"] [data-action="append"]').click();
      assert.equal(await page.locator('.meld.invalid').count(),0);
      await page.locator('[data-action="commit"]').click();
      await page.waitForTimeout(100);
      assert(committed,'turn completed');
      const jokers=committed.board.flatMap(g=>g.tiles).filter(t=>t.id.startsWith('joker'));
      assert.equal(jokers.length,2);
      assert(jokers.every(t=>!('asNumber' in t) && !('asColor' in t)));
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.joker-heart').first().evaluate(el=>getComputedStyle(el).animationName),'none');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px heart rendering, no assignment dialog, existing joker ${width===1280?'drag':'selection'}, commit and reduced motion`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
