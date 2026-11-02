const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const code=fs.readFileSync(__dirname+'/shared-todos.js','utf8');
function setup(db=[], user='one'){
  const nodes={},messages=[],intervals=[];let missing=false,denied=false,offline=false,localAdds=0;
  function node(id){return nodes[id]??={textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,querySelector:()=>node('submit'),querySelectorAll(){return []},onsubmit(){localAdds++}}}
  function query(table){let op='read',value,filters=[],offset=0,end=499,ignore=false;
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){offset=a;end=b;return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]||null}))},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},upsert(v){op='insert';value=v;ignore=true;return q},then(resolve,reject){return Promise.resolve().then(()=>{
      if(offline) return {error:{message:'offline'}};
      if(table==='love_members')return {data:denied?[]:[{journal_id:'journal'}]};
      if(missing)return {error:{code:'PGRST205',message:'missing'}};
      if(denied)return {error:{message:'denied'}};
      if(op==='insert'){
        if(!(ignore&&db.some(r=>r.legacy_key===value.legacy_key&&r.created_by===value.created_by)))db.push({id:'id'+db.length,...value});
        return {data:[{id:db.at(-1).id}]};
      }
      const rows=db.filter(r=>filters.every(([k,v])=>r[k]===v));
      if(op==='update')rows.forEach(r=>Object.assign(r,value));
      return {data:rows.slice(offset,end+1).map(r=>({...r}))};
    }).then(resolve,reject)}};return q;
  }
  const client={from:query}, state={customTodos:[],checks:[]};
  const context={window:{},document:{getElementById:node,hidden:false,addEventListener(){}},state,checks(){node('custom-todos').innerHTML='local'},esc:s=>String(s).replaceAll('<','&lt;'),toast:m=>messages.push(m),crypto:webcrypto,TextEncoder,setInterval:(fn,ms)=>intervals.push({fn,ms})};
  vm.createContext(context);vm.runInContext(code,context);
  const source={client,session:{user:{id:user}},mode:'cloud',journalId:'journal'};
  return {context,node,state,messages,intervals,setMissing:v=>missing=v,setDenied:v=>denied=v,setOffline:v=>offline=v,localAdds:()=>localAdds,async login(){context.window.loveTodoContext(source);await context.window.loveRefreshTodos()},logout(){context.window.loveTodoContext({...source,session:null,mode:'local'})},refresh:()=>context.window.loveRefreshTodos(),async add(title){node('todo-text').value=title;await node('todo-form').onsubmit({preventDefault(){}})},update:(id,done)=>vm.runInContext(`document.getElementById('custom-todos')`,context)};
}
test('Two members share new tasks and exports; signed-out entries remain local',async()=>{
  const db=[],a=setup(db,'one'),b=setup(db,'two');await a.login();await b.login();
  await a.add('一起看日出');await b.refresh();assert.match(b.node('custom-todos').innerHTML,/一起看日出/);
  const backup=await b.context.window.loveTodoBackup();assert.equal(backup.customTodos[0],'一起看日出');
  assert.equal(a.state.customTodos.length,0);b.logout();assert.equal(b.node('custom-todos').innerHTML,'local');
  await b.add('local only');assert.equal(b.localAdds(),1);assert.equal(db.length,1);
});
test('Shared checkboxes update for the other member',async()=>{
  const db=[],a=setup(db),b=setup(db,'two');await a.login();await a.add('a');await b.login();
  let box={dataset:{cloudTodo:db[0].id},checked:true};b.node('custom-todos').querySelectorAll=()=>[box];await b.refresh();
  await box.onchange();await a.refresh();assert.equal(db[0].done,true);assert.match(a.node('custom-todos').innerHTML,/checked/);
});
test('Missing table and nonmembers cannot submit; failed writes retain draft',async()=>{
  const db=[],a=setup(db);a.setMissing(true);await a.login();assert.equal(a.node('submit').disabled,true);assert.match(a.node('todo-status').textContent,/尚未开通/);
  await a.add('blocked');assert.equal(db.length,0);a.setMissing(false);a.setDenied(true);await a.refresh();assert.equal(a.node('submit').disabled,true);
  a.setDenied(false);await a.refresh();a.setOffline(true);await a.add('draft');assert.equal(a.node('todo-text').value,'draft');assert.equal(db.length,0);
});
test('Local migration is repeatable and preserves checked states and local copies',async()=>{
  const db=[],a=setup(db);a.state.customTodos=['old'];a.state.checks=[false,false,false,true];await a.login();
  await a.node('todo-share-local').onclick();await a.node('todo-share-local').onclick();assert.equal(db.length,1);assert.equal(db[0].done,true);assert.equal(a.state.customTodos[0],'old');
});
test('Cloud refresh interval is two minutes and HTML titles remain text',async()=>{
  const a=setup();await a.login();assert.equal(a.intervals[0].ms,120000);await a.add('<img src=x>');assert.doesNotMatch(a.node('custom-todos').innerHTML,/<img/);
});
