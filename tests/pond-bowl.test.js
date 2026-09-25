'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const music = require('../pond-music');
test('bowls strike a finite eleven-note pentatonic register from the first sample',()=>{
 for(const family of ['dawn','dusk','mist']){
  const frequencies=new Set();
  for(let i=0;i<=1000;i++){
   const plan=music.bowlPlan(i/1000,.5,.42,family);frequencies.add(plan.frequency);
   assert.equal(plan.frequency,music.bowlFrequency(i/1000,family));
   assert.ok(plan.frequency>=196 && plan.frequency<785);
  }
  assert.equal(frequencies.size,11);
 }
 assert.equal(music.bowlFrequency(0)*4,music.bowlFrequency(1));
 assert.equal(music.bowlFrequency(.3)/music.bowlFrequency(0),1.5);
});
test('bowl modes have bounded peaks, fixed consonant partials and a finite softer upper tail',()=>{
 for(const depth of [0,.5,1])for(const attack of [0,.42,1]){
  const p=music.bowlPlan(.4,depth,attack);
  assert.equal(p.modes.length,4);assert.ok(Object.isFrozen(p.modes[0]));
  assert.ok(p.duration>=3.4&&p.duration<=4.8);
  assert.ok(p.attackSeconds>=.014&&p.attackSeconds<=.026000001);
  assert.ok(p.modes.reduce((sum,m)=>sum+m.peak,0)<.125);
  assert.ok(p.modes[3].duration<p.modes[2].duration);
  assert.equal(p.modes[2].frequency,p.frequency*2);
  assert.equal(p.modes[3].frequency,p.frequency*3);
 }
});
test('every bowl carries its own alloy while one pitch stays one pitch',()=>{
 const shineAt=x=>music.bowlShine(x,.5,.42);
 assert.equal(shineAt(.34),shineAt(.34));
 const shine=[...Array(11)].map((_,i)=>shineAt(i/10));
 const spreadCharacter=Math.max(...shine)-Math.min(...shine);
 assert.ok(spreadCharacter>.25,'the eleven bowls should differ in character');
 // Three strikes inside one bowl cell share a pitch but not a timbre.
 const left=music.bowlPlan(.27,.5,.42),centre=music.bowlPlan(.30,.5,.42),right=music.bowlPlan(.33,.5,.42);
 assert.equal(left.frequency,centre.frequency);assert.equal(right.frequency,centre.frequency);
 const bits=new Set([left,centre,right].map(p=>p.shine.toFixed(4)));
 assert.equal(bits.size,3);
 assert.notDeepEqual(left.modes.map(m=>m.peak),centre.modes.map(m=>m.peak));
});
test('bowl shine is bounded, gesture-derived and safe for damaged input',()=>{
 assert.ok(music.bowlShine(.5,0,1)>music.bowlShine(.5,1,0));
 assert.ok(music.bowlShine(.5,.5,1)>music.bowlShine(.5,.5,0));
 for(const x of [NaN,Infinity,-100,100,undefined])for(const d of [NaN,-1,2])for(const a of [NaN,-1,2]){
  const s=music.bowlShine(x,d,a);assert.ok(Number.isFinite(s)&&s>=0&&s<=1);
 }
});
test('damaged bowl inputs remain finite and bounded',()=>{
 for(const x of [NaN,Infinity,-100,100,undefined]){
  const p=music.bowlPlan(x,NaN,Infinity,'unknown');
  assert.ok(Number.isFinite(p.frequency));assert.ok(Number.isFinite(p.duration));
  p.modes.forEach(m=>assert.ok(Number.isFinite(m.peak)&&m.peak>0));
 }
});
