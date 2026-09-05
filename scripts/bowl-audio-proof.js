'use strict';
// Real production Web Audio capture, identical seeded input for both revisions.
// ScriptProcessor is test-only: tap the destination without changing product DSP.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');
(async () => {
 const root = path.resolve(__dirname, '..'), label = process.argv[2] || 'after';
 const out = path.join(root, 'output/bowls-57'); fs.mkdirSync(out, {recursive:true});
 const server = createStaticServer(root), origin = await listenOnLoopback(server);
 const browser = await chromium.launch({executablePath:'/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
 const page = await browser.newPage({viewport:{width:800,height:800},reducedMotion:'reduce'});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(() => {
  let seed=5701; Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  window.samples=[]; window.contexts=[];
  const Native=window.AudioContext;
  window.AudioContext=class extends Native { constructor(options) { super(options); window.contexts.push(this);
   const tap=this.createScriptProcessor(2048,2,2); tap.onaudioprocess=e=>{
    const a=e.inputBuffer.getChannelData(0), b=e.inputBuffer.getChannelData(1);
    window.samples.push([Array.from(a),Array.from(b)]);
   }; tap.connect(this.destination);
   const connect=AudioNode.prototype.connect;
   const dest=this.destination;
   // Only the compressor's final output is tapped, never feedback or sends.
   const old=this.createDynamicsCompressor.bind(this);
   this.createDynamicsCompressor=()=>{const node=old();node.connect=function(target,...args){if(target===dest)connect.call(this,tap);return connect.call(this,target,...args);};return node;};
  }};
 });
 await page.goto(origin,{waitUntil:'networkidle'});
 if(label==='maximum' || label==='muted') {
  await page.locator('#volume-stone').click();
  if(label==='maximum') await page.locator('#master-volume').fill('100');
  else await page.locator('#mute-water').click();
  await page.keyboard.press('Escape');
 }
 const autoplayContexts=await page.evaluate(()=>contexts.length);
 await page.mouse.click(400,400); // same explicit unlock/initial strike
 await page.evaluate(async()=>{
  const c=document.querySelector('#pond');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let seed=12345; const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const emit=(type,id,x,y)=>c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===10,clientX:x,clientY:y,pressure:type==='pointerup'?0:.5,buttons:type==='pointerup'?0:1,bubbles:true}));
  window.proofEvents=[];
  for(let i=0;i<12;i++){const x=90+random()*620,y=180+random()*440;proofEvents.push({section:'taps',x,y});emit('pointerdown',10,x,y);await wait(65);emit('pointerup',10,x,y);await wait(280);}
  emit('pointerdown',20,321,410); await wait(6500); // held bowl must decay, never sustain forever
  window.heldVoices=c.dataset.audioVoices;emit('pointerup',20,321,410); await wait(500);
  for(let group=0;group<4;group++) {const n=3+group, points=[];for(let i=0;i<n;i++){const x=90+random()*620,y=180+random()*440;points.push([x,y]);proofEvents.push({section:'dense',group,x,y});emit('pointerdown',30+i,x,y);}await wait(400);points.forEach(([x,y],i)=>emit('pointerup',30+i,x,y));await wait(180);}
  await wait(6500);
 });
 const data=await page.evaluate(()=>({samples,rate:contexts[0].sampleRate,heldVoices,events:proofEvents,voices:document.querySelector('#pond').dataset.audioVoices,state:contexts[0].state}));
 const count=data.samples.reduce((n,b)=>n+b[0].length,0), wav=Buffer.alloc(44+count*4);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(data.rate,24);wav.writeUInt32LE(data.rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);
 let cursor=44,peak=0,sum=0,clipped=0;const seconds=[];let frame=0;
 for(const block of data.samples)for(let i=0;i<block[0].length;i++,frame++){const sec=Math.floor(frame/data.rate);seconds[sec]??={sum:0,n:0,peak:0};for(let ch=0;ch<2;ch++){const v=block[ch][i];peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=1)clipped++;seconds[sec].sum+=v*v;seconds[sec].n++;seconds[sec].peak=Math.max(seconds[sec].peak,Math.abs(v));wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),cursor);cursor+=2;}}
 fs.writeFileSync(path.join(out,`${label}.wav`),wav);
 const report={label,autoplayContexts,rate:data.rate,duration:count/data.rate,peak,peakDb:20*Math.log10(peak),rmsDb:10*Math.log10(sum/(count*2)),clipped,heldVoices:data.heldVoices,finalVoices:data.voices,state:data.state,errors,events:data.events,seconds:seconds.map(s=>({rmsDb:10*Math.log10(s.sum/s.n),peak:s.peak}))};
 fs.writeFileSync(path.join(out,`${label}.json`),JSON.stringify(report,null,2));
 await page.screenshot({path:path.join(out,`${label}.png`)});
 console.log(JSON.stringify({...report,events:report.events.length,seconds:report.seconds},null,2));
 if(errors.length||autoplayContexts!==0||data.voices!=='0'||clipped||(label==='muted'&&peak>0.000001))throw Error('Audio/browser proof failed');
 } finally {await browser.close();await closeServer(server);}
})().catch(e=>{console.error(e);process.exitCode=1;});
