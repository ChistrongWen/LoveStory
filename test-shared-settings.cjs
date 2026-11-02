const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {webcrypto}=require('node:crypto');
function setup(db={},options={}){
 const nodes={},messages=[];const node=id=>nodes[id]??={value:'',textContent:'',innerText:'',innerHTML:'',hidden:false,disabled:false,open:false,onclick(){},click(){this.onclick()},onsubmit(){},onchange(){},close(){this.open=false},showModal(){this.open=true},querySelector:()=>node('anniversary-input')};
 const store={async read(key){return structuredClone(db[key]||{value:null,version:0})},async write(key,value,version){if((db[key]?.version||0)!==version)throw Error('另一人已修改');return db[key]={value:structuredClone(value),version:version+1}}};
 const client={rpc:options.rpc|| (async name=>{assert.equal(name,'love_public_anniversary');return {data:db.anniversary?.value||'2023-08-22'}}),from(){if(options.onPrivateRead)options.onPrivateRead();const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:options.nonmember?null:{journal_id:'j'}})};return q},storage:{from:()=>({upload:async()=>({}),createSignedUrl:async path=>({data:{signedUrl:'https://example.com/'+path}})})}};
 const context={window:{createJournalStore:()=>store},document:{getElementById:node,hidden:false,addEventListener(){}},notes:['local note'],noteIndex:0,state:{anniversary:'2020-01-01'},audio:{src:'default.mp3',currentTime:0,paused:true,pause(){this.paused=true},async play(){this.paused=false}},esc:String,toast:m=>messages.push(m),crypto:webcrypto,Date,FormData:class{constructor(x){this.fields=x.fields}get(k){return this.fields[k]}},setInterval(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/shared-settings.js','utf8'),context);
 const source={client,session:{user:{id:'one'}},mode:'cloud',journalId:'j'};
 return {context,node,messages,async login(){context.window.loveSettingsContext(source);await context.window.loveRefreshSettings()},refresh:()=>context.window.loveRefreshSettings(),async logout(){context.window.loveSettingsContext({...source,mode:'local',session:null});await context.window.loveRefreshSettings()},anniversary:date=>node('config-form').onsubmit({preventDefault(){},target:{fields:{anniversary:date}}})};
}
test('Anniversary and notes synchronize without overwriting local settings',async()=>{
 const db={},a=setup(db),b=setup(db);await a.login();await b.login();a.node('settings').onclick();await a.anniversary('2025-01-01');await b.refresh();assert.equal(b.node('since').textContent,'2025.01.01');assert.equal(b.context.state.anniversary,'2020-01-01');
 a.node('edit-notes').onclick();a.node('notes-text').value='shared note';await a.node('notes-form').onsubmit({preventDefault(){}});await b.refresh();assert.equal(b.node('little-note').innerText,'shared note');await b.logout();assert.equal(b.node('little-note').innerText,'local note');assert.equal(b.node('since').textContent,'2025.01.01');
});
test('Visitors see the public anniversary without accessing private tables or editing',async()=>{
 const db={anniversary:{value:'2023-08-22',version:1}},a=setup(db,{onPrivateRead(){assert.fail('Anonymous private table access')}});
 await a.logout();assert.equal(a.node('since').textContent,'2023.08.22');let loginRequested=false;a.node('cloud-login').onclick=()=>{loginRequested=true};a.node('settings').onclick();assert(loginRequested);await a.anniversary('2022-08-22');assert.equal(db.anniversary.value,'2023-08-22');
 db.anniversary.value='2024-01-01';await a.refresh();assert.equal(a.node('since').textContent,'2024.01.01');
});
test('Missing public RPC keeps the confirmed date visible and prevents inconsistent edits',async()=>{
 const db={},a=setup(db,{rpc:async()=>({error:{message:'function missing'}})});await a.login();assert.equal(a.node('since').textContent,'2023.08.22');a.node('settings').onclick();assert.equal(a.node('config').open,false);await a.anniversary('2022-08-22');assert.equal(db.anniversary,undefined);assert(a.messages.some(s=>s.includes('配置')));
});
test('Nonmembers can see the public date but cannot change it',async()=>{
 const db={},a=setup(db,{nonmember:true});await a.login();assert.equal(a.node('since').textContent,'2023.08.22');a.node('settings').onclick();await a.anniversary('2022-08-22');assert.equal(db.anniversary,undefined);assert.equal(a.node('config').open,false);
});
test('Late public response from a previous session cannot overwrite current data',async()=>{
 let resolveOld,calls=0;const a=setup({anniversary:{value:'2024-06-01',version:1}},{rpc:()=>++calls===1?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({data:'2024-06-01'})});
 const old=a.logout();await a.login();resolveOld({data:'2022-08-22'});await old;assert.equal(a.node('since').textContent,'2024.06.01');
});
test('Stale anniversary form keeps draft when the other member saves first',async()=>{
 const db={},a=setup(db),b=setup(db);await a.login();await b.login();a.node('settings').onclick();b.node('settings').onclick();await b.anniversary('2025-02-02');await a.anniversary('2025-03-03');assert.equal(db.anniversary.value,'2025-02-02');assert.equal(a.node('config').open,true);assert(a.messages.some(s=>s.includes('另一人')));
});
test('Uploaded music becomes shared and logout restores local audio',async()=>{
 const db={},a=setup(db),b=setup(db);await a.login();await b.login();await a.node('audioFile').onchange({target:{files:[{type:'audio/mpeg',size:10,name:'song.mp3'}],value:'song'}});await b.refresh();assert.match(b.context.audio.src,/https:\/\/example.com\/j\//);assert.equal(db.music.value.name,'song.mp3');b.logout();assert.equal(b.context.audio.src,'default.mp3');
});
