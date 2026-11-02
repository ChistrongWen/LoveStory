const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(initial={records:[],anniversary:'',checks:[true,false,true]}){
  const nodes=new Map();let stored=JSON.stringify(initial),fail=false;
  const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},focus(){},click(){},setAttribute(){}});return nodes.get(s)};
  const fixed=[0,1,2].map(i=>{const n=node('check'+i);n.dataset.check=String(i);return n});
  const context={window:{},document:{querySelector:node,querySelectorAll:s=>s==='[data-check]'?[...fixed,...Array.from(node('#custom-todos').innerHTML.matchAll(/data-check="(\d+)"/g),m=>{const n=node('check'+m[1]);n.dataset.check=m[1];return n})]:[]},localStorage:{getItem:()=>stored,setItem:(k,v)=>{if(fail)throw Error();stored=v}},setTimeout(){},console,confirm:()=>true};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
  return {node,context,data:()=>JSON.parse(stored),fail:()=>{fail=true},add(text){node('#todo-text').value=text;node('#todo-form').onsubmit({preventDefault(){}})},async restore(data){await node('#backupFile').onchange({target:{files:[{text:async()=>JSON.stringify(data)}]}})}};
}
test('Add, complete and reload custom todos without changing existing checks',()=>{
  const x=setup();x.add('  一起看日出  ');assert.deepEqual(x.data().customTodos,['一起看日出']);assert.deepEqual(x.data().checks,[true,false,true,false]);
  x.node('check3').checked=true;x.node('check3').onchange();
  const y=setup(x.data());assert.equal(y.node('check3').checked,true);assert.match(y.node('#custom-todos').innerHTML,/一起看日出/);
});
test('Blank and oversized entries are rejected and HTML is escaped',()=>{
  const x=setup();x.add('  ');x.add('字'.repeat(101));assert.equal(x.node('#custom-todos').innerHTML,'');
  x.add('<img src=x onerror=alert(1)>');assert.match(x.node('#custom-todos').innerHTML,/&lt;img/);assert.doesNotMatch(x.node('#custom-todos').innerHTML,/<img/);
});
test('Failed saves retain draft and rollback checks and new entries',()=>{
  const x=setup();x.fail();x.add('一起旅行');assert.equal(x.node('#todo-text').value,'一起旅行');assert.equal(x.node('#custom-todos').innerHTML,'');
  x.node('check0').checked=false;x.node('check0').onchange();assert.equal(x.node('check0').checked,true);
  assert.equal(vm.runInContext('state.customTodos.length',x.context),0);
});
test('New backups restore todos; legacy backups remain compatible; invalid todos rejected',async()=>{
  const x=setup();x.add('一起旅行');const backup=x.data();await x.restore({records:[],checks:[false]});assert.equal(x.node('#custom-todos').innerHTML,'');
  await x.restore(backup);assert.match(x.node('#custom-todos').innerHTML,/一起旅行/);
  await x.restore({records:[],customTodos:[{}]});assert.deepEqual(x.data(),backup);
});
