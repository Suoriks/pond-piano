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
test('damaged bowl inputs remain finite and bounded',()=>{
 for(const x of [NaN,Infinity,-100,100,undefined]){
  const p=music.bowlPlan(x,NaN,Infinity,'unknown');
  assert.ok(Number.isFinite(p.frequency));assert.ok(Number.isFinite(p.duration));
  p.modes.forEach(m=>assert.ok(Number.isFinite(m.peak)&&m.peak>0));
 }
});
