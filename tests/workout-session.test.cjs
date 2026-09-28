const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve('src/lib/workout-session.ts');
const moduleUnderTest = new Module(filename, module);
moduleUnderTest._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
const {blankSet,newSession,validSet,workoutContent,previousWorkout,emptyDraft,readDraft} = moduleUnderTest.exports;
const set = () => ({...blankSet(),bodyPart:'하체',exercise:'레그 익스텐션',weight:'30',reps:'15',done:true});
test('loading a previous workout resets all completion flags',()=>{
 const previous = previousWorkout(JSON.stringify({type:'workout',sets:[set(),set()],memo:'',bodyFlags:[]}));
 const session = newSession(previous.sets);
 assert.equal(session.sets.length,2);
 assert.equal(session.sets.some(s=>s.done),false);
 assert.notEqual(session.sets[0].id,previous.sets[0].id);
 assert.throws(()=>workoutContent(session));
});
test('only completed sets are saved in the existing statistics schema',()=>{
 const session = newSession(); session.sets=[set(),{...set(),done:false}];
 const record=JSON.parse(workoutContent(session));
 assert.equal(record.sets.length,1); assert.equal(record.sets[0].weight,'30');
 assert.equal(record.type,'workout');assert.equal(record.mode,'detailed');
 assert.deepEqual(record.bodyFlags,[]);assert.ok(record.clientSessionId);
 assert.equal('done' in record.sets[0],false);
});
test('invalid values cannot count as completed sets, while bodyweight and cardio can',()=>{
 assert.equal(validSet({...set(),weight:'-1'}),false);
 assert.equal(validSet({...set(),reps:'0'}),false);
 assert.equal(validSet({...set(),reps:'1.5'}),false);
 assert.equal(validSet({...set(),exercise:''}),false);
 assert.equal(validSet({...set(),weight:''}),true);
 assert.equal(validSet({...set(),bodyPart:'유산소',duration:'20',reps:''}),true);
});
test('simple workout stays a free record without inventing completed sets',()=>{
 const session = newSession();session.mode='simple';session.simplePart='하체';session.minutes='40';session.memo='가볍게';
 const data=JSON.parse(workoutContent(session));assert.equal(data.mode,'free');assert.deepEqual(data.sets,[]);assert.equal(data.freeText,'하체 · 40분\n가볍게');
 session.minutes='0';assert.throws(()=>workoutContent(session));
});
test('pending payload is stable across retries and resumed sessions',()=>{
 const session=newSession();session.sets=[set()];session.pendingContent=workoutContent(session,Date.now());
 const restored=readDraft(JSON.stringify({...emptyDraft(),screen:'workout',session}));
 assert.equal(workoutContent(restored.session,Date.now()+900000),session.pendingContent);
});
test('legacy text remains a reference and is never counted as a completed set',()=>{
 assert.deepEqual(previousWorkout('하체 40분'),{sets:[],preview:'하체 40분'});
 assert.deepEqual(previousWorkout('{bad json'),{sets:[],preview:'{bad json'});
});
test('draft round trip preserves completed sets, diary and timer; corrupt drafts reject',()=>{
 const session=newSession();session.sets=[set()];session.restUntil=Date.now()+90000;
 const d={...emptyDraft(),screen:'diary',session,diary:'좋았어',mood:'개운함',afterWorkout:true};
 assert.deepEqual(readDraft(JSON.stringify(d)),d);
 assert.throws(()=>readDraft('{broken'));
 assert.throws(()=>readDraft(JSON.stringify({...d,session:{...session,sets:[{done:true}]}})));
});
