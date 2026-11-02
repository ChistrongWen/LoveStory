/* Shared checklist uses the journal's existing authenticated membership. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const form = el('todo-form'), input = el('todo-text'), list = el('custom-todos');
  const status = el('todo-status'), reload = el('todo-refresh'), migrate = el('todo-share-local');
  const submit = form.querySelector('[type=submit]'), localSubmit = form.onsubmit;
  let source = null, version = 0, rows = [], ready = false, busy = false, pending = null;
  const cloud = () => !!(source && source.mode === 'cloud' && source.session && source.client);
  function controls() {
    reload.hidden = migrate.hidden = !cloud();
    submit.disabled = cloud() && (!ready || busy || !!pending);
    reload.disabled = busy;
    migrate.disabled = !ready || busy || !!pending || !state.customTodos.length;
    migrate.textContent = '共享本机待办（' + state.customTodos.length + '）';
  }
  function draw() {
    list.innerHTML = rows.map(r => `<label><input type="checkbox" data-cloud-todo="${esc(r.id)}" ${r.done ? 'checked' : ''} ${busy || pending ? 'disabled' : ''}> ${esc(r.title)}</label><div class="todo-row-actions"><button class="text-button" data-todo-edit="${esc(r.id)}" ${busy || pending ? 'disabled' : ''}>编辑</button> <button class="text-button" data-todo-delete="${esc(r.id)}" ${busy || pending ? 'disabled' : ''}>删除</button></div>`).join('');
    list.querySelectorAll('[data-cloud-todo]').forEach(box => {
      box.onchange = () => update(box.dataset.cloudTodo, box.checked);
    });
    list.querySelectorAll('[data-todo-edit]').forEach(button=>button.onclick=()=>{
      const row=rows.find(r=>r.id===button.dataset.todoEdit);if(!row)return;
      const value=prompt('修改这条共同待办',row.title);if(value===null)return;const title=value.trim();
      if(!title||title.length>100){toast('请输入 1–100 字');return}
      return mutate(async current=>{const result=await current.client.from('love_todos').update({title}).eq('journal_id',current.journalId).eq('id',row.id).eq('title',row.title).select('id');if(result.error)throw result.error;if(!result.data.length)throw Error('事项已改变，请刷新后重试')},()=>toast('待办已更新'));
    });
    list.querySelectorAll('[data-todo-delete]').forEach(button=>button.onclick=()=>{
      if(!confirm('删除这条共同待办？两个人都将看不到它。'))return;
      return mutate(async current=>{const result=await current.client.from('love_todos').delete().eq('journal_id',current.journalId).eq('id',button.dataset.todoDelete);if(result.error)throw result.error},()=>toast('待办已删除'));
    });
    controls();
  }
  function fail(error) {
    const missing = ['PGRST205','42P01'].includes(error.code);
    status.textContent = missing ? '共同待办尚未开通，请联系手账管理员完成配置后点击刷新。' : '待办同步失败，请点击刷新重试：' + error.message;
  }
  async function refresh() {
    if (!cloud() || busy) return;
    if (pending) return pending;
    const current = source, token = version;
    status.textContent = '正在同步共同待办…';
    const run = (async () => {
      try {
        const membership = await current.client.from('love_members').select('journal_id').eq('journal_id',current.journalId).eq('user_id',current.session.user.id).maybeSingle();
        if (membership.error) throw membership.error;
        if (!membership.data) throw Error('当前账号尚未加入共同手账');
        let all = [], offset = 0;
        while (true) {
          const result = await current.client.from('love_todos').select('id,title,done,created_at').eq('journal_id',current.journalId).order('created_at').order('id').range(offset,offset+499);
          if (result.error) throw result.error;
          all.push(...result.data);
          if (result.data.length < 500) break;
          offset += 500;
        }
        if (token !== version) return;
        rows = all; ready = true; draw();
        status.textContent = rows.length ? '共同待办 · 两人共享 · 每 2 分钟自动刷新' : '共同待办还是空的，写下你们的第一个计划吧。';
      } catch (error) {
        if (token !== version) return;
        rows = []; ready = false; draw(); fail(error);
      }
    })();
    pending = run;
    draw();
    try { await run; } finally { if (pending === run) { pending = null; draw(); } }
  }
  async function mutate(action, success) {
    if (!cloud() || busy || !ready || pending) return;
    const current = source, token = version;
    busy = true; draw();
    try {
      await action(current);
      if (token === version) success();
    } catch (error) {
      if (token === version) { fail(error); toast('待办保存失败，未确认同步：' + error.message); }
    } finally {
      if (token === version) { busy = false; draw(); }
    }
    if (token === version) await refresh();
  }
  async function update(id, done) {
    return mutate(async current => {
      const result = await current.client.from('love_todos').update({done}).eq('journal_id',current.journalId).eq('id',id).select('id');
      if (result.error) throw result.error;
      if (!result.data.length) throw Error('没有更新成功，请刷新后重试');
    }, () => toast('完成状态已同步 ♡'));
  }
  form.onsubmit = e => {
    if (!cloud()) return localSubmit(e);
    e.preventDefault();
    const title = input.value.trim();
    if (!title || title.length > 100) { toast('请输入 1–100 字的待办事项'); return; }
    return mutate(async current => {
      const result = await current.client.from('love_todos').insert({journal_id:current.journalId,created_by:current.session.user.id,title,done:false}).select('id');
      if (result.error) throw result.error;
      if (!result.data.length) throw Error('没有添加成功，请重试');
    }, () => { if (input.value.trim() === title) input.value = ''; toast('已添加到两人的共同待办 ♡'); });
  };
  migrate.onclick = () => {
    const items = state.customTodos.map((title,i) => ({title,done:!!state.checks[i+3],index:i}));
    if (!items.length) return;
    return mutate(async current => {
      for (const item of items) {
        const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([item.index,item.title])));
        const legacy_key = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const result = await current.client.from('love_todos').upsert({journal_id:current.journalId,created_by:current.session.user.id,title:item.title,done:item.done,legacy_key},{onConflict:'journal_id,created_by,legacy_key',ignoreDuplicates:true});
        if (result.error) throw result.error;
      }
    }, () => toast('本机待办已共享，原记录仍保留；重复点击不会重复添加。'));
  };
  reload.onclick = refresh;
  window.loveRefreshTodos = refresh;
  window.loveTodoBackup = async () => {
    if (busy) throw Error('请等待待办保存完成后再导出');
    await refresh();
    if (!cloud() || !ready) throw Error('请先成功同步共同待办后再导出');
    return {customTodos:rows.map(r=>r.title),checks:[false,false,false,...rows.map(r=>r.done)]};
  };
  window.loveTodoContext = next => {
    const changed = !source || source.client !== next.client || source.mode !== next.mode || source.journalId !== next.journalId || source.session?.user.id !== next.session?.user.id;
    source = next;
    if (!changed) return;
    version++; rows = []; ready = false; busy = false; pending = null;
    if (cloud()) { draw(); refresh(); }
    else { checks(); status.textContent = '本机待办 · 登录共同手账后可使用共享清单'; controls(); }
  };
  setInterval(() => { if (!document.hidden) refresh(); },120000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
  controls();
})();
