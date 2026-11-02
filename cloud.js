/* Cloud records stay in memory; local records/backup remain separate. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const cfg = window.LOVE_SUPABASE || {};
  let client, session = null, cloudRows = [], mode = 'local', busy = false, epoch = 0, loading = false, synced = false;
  const originalSubmit = el('memory-form').onsubmit;
  const originalExport = el('export').onclick, originalImport = el('import').onclick;
  const panel = el('cloud-status');
  const message = t => { panel.textContent = t; };
  function configured() {
    if (/^eyJ/.test(cfg.publishableKey || '')) {
      try {
        const payload=JSON.parse(atob(cfg.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(payload.role !== 'anon') return false;
      } catch { return false; }
    }
    return /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(cfg.url || '') &&
      /^(sb_publishable_|eyJ)/.test(cfg.publishableKey || '') &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cfg.journalId || '');
  }
  function display() {
    if(window.loveSettingsContext)window.loveSettingsContext({client,session,mode,journalId:cfg.journalId});
    if(window.loveTodoContext)window.loveTodoContext({client,session,mode,journalId:cfg.journalId});
    el('cloud-mode').textContent = mode === 'cloud' ? '我们的云端手帐' : '本机手帐';
    el('cloud-login').hidden = !!session;
    el('cloud-logout').hidden = !session;
    el('cloud-refresh').hidden = !session;
    el('cloud-migrate').hidden = !session || mode !== 'cloud';
    el('cloud-toggle').hidden = !session;
    el('cloud-toggle').textContent = mode === 'cloud' ? '查看本机记录' : '查看云端记录';
    el('cloud-who').textContent = session ? '已登录：' + session.user.email : '';
    render();
  }
  window.loveVisibleRecords = () => mode === 'cloud' ? cloudRows : state.records;
  window.loveCloudDelete = async id => {
    if (mode !== 'cloud') return false;
    if (busy || loading) return true;
    if (!confirm('删除这条共享回忆？另一台设备也将看不到它。')) return true;
    const r = cloudRows.find(x => x.id === id);
    if (!r) return true;
    busy = true;
    try {
      const paths=await albumPaths(r);
      const result = await client.from('love_memories').delete().eq('journal_id',cfg.journalId).eq('id',id).select('id');
      if (result.error) throw result.error;
      if (!result.data.length) throw Error('记录未删除，请刷新并检查权限');
      cloudRows = cloudRows.filter(x => x.id !== id);
      el('detail').close(); render();
      if (r.photo_path) {
        const removed = await client.storage.from('love-photos').remove(paths);
        if (removed.error) { toast('回忆已删除，但照片清理失败，请稍后在存储中清理。'); return true; }
      }
      toast('共享回忆已删除');
    } catch(e) { toast('删除失败：' + e.message); }
    finally { busy = false; }
    return true;
  };
  async function albumPaths(r) {
    if (!r.photo_path) return [];
    const folder=cfg.journalId+'/'+r.id;
    const listed=await client.storage.from('love-photos').list(folder,{limit:100,sortBy:{column:'name',order:'asc'}});
    if(listed.error)throw listed.error;
    return [r.photo_path,...listed.data.filter(x=>/^\d{3}\.jpg$/.test(x.name)).map(x=>folder+'/'+x.name)];
  }
  async function refresh() {
    if (!client || !session || loading || busy) return;
    const version = epoch;
    loading = true; message('正在同步共同回忆…');
    try {
      const membership = await client.from('love_members').select('journal_id').eq('journal_id',cfg.journalId).eq('user_id',session.user.id).maybeSingle();
      if (membership.error) throw membership.error;
      if (!membership.data) throw Error('这个账号尚未加入共同手帐，请让项目管理员添加成员。');
      let data = [], from = 0;
      while (true) {
        const page = await client.from('love_memories').select('*').eq('journal_id',cfg.journalId).order('date',{ascending:false}).order('id',{ascending:false}).range(from,from+499);
        if (page.error) throw page.error;
        data.push(...page.data);
        if (page.data.length < 500) break;
        from += 500;
      }
      for(const r of data)r.photo_paths=await albumPaths(r);
      const paths = data.flatMap(r=>r.photo_paths), urls = new Map();
      for (let i=0;i<paths.length;i+=100) {
        const signed = await client.storage.from('love-photos').createSignedUrls(paths.slice(i,i+100),3600);
        if (signed.error) throw signed.error;
        if (signed.data.some(x=>x.error || !x.signedUrl)) throw Error('部分照片无法读取，请检查存储权限');
        for (const x of signed.data) urls.set(x.path,x.signedUrl);
      }
      if (epoch !== version || !session) return;
      synced = true;
      cloudRows = data.map(r=>({...r,photo:r.photo_path?urls.get(r.photo_path):undefined,photos:r.photo_paths.map(p=>urls.get(p))}));
      message('云端已同步 · ' + data.length + ' 条回忆 · ' + new Date().toLocaleTimeString() + '（每 2 分钟自动刷新）');
      display();
    } catch(e) {
      if (epoch === version) { synced=false; cloudRows=[]; render(); message('同步失败：' + e.message + '。请刷新云端后重试。'); }
    } finally { loading = false; }
  }
  function requireLogin() {
    if (!configured()) { message('云端尚未连接。请按 SUPABASE_SETUP.md 完成项目配置；现有本机记录仍可正常使用。'); return; }
    if (!client) { message('云端组件未加载，请检查网络后刷新页面。'); return; }
    el('cloud-auth').showModal();
  }
  el('cloud-login').onclick = requireLogin;
  el('cloud-form').onsubmit = async e => {
    e.preventDefault();
    if (busy || !client) return;
    busy = true; const button=e.target.querySelector('[type=submit]'); button.disabled=true;
    el('cloud-auth-message').textContent='正在登录…';
    try {
      const fd=new FormData(e.target);
      const r=await client.auth.signInWithPassword({email:String(fd.get('email')).trim(),password:String(fd.get('password'))});
      if (r.error) throw r.error;
      session=r.data.session; epoch++; cloudRows=[]; mode='cloud';
      e.target.reset(); el('cloud-auth').close(); display();
    } catch(err) { el('cloud-auth-message').textContent='登录失败：'+err.message; }
    finally { busy=false; button.disabled=false; }
    await refresh();
  };
  el('cloud-logout').onclick = async () => {
    if (busy || loading) return;
    el('editor').close();
    const r=await client.auth.signOut({scope:'local'});
    if (r.error) { toast('退出失败：'+r.error.message); return; }
    session=null; epoch++; cloudRows=[]; mode='local'; el('detail').close();
    message('已退出云端，当前显示本机手帐。'); display();
  };
  el('cloud-toggle').onclick = () => {
    if (busy || loading || el('editor').open) return;
    mode=mode==='cloud'?'local':'cloud'; el('detail').close(); display();
    if (mode==='cloud') refresh();
    else message('当前为本机手帐；此处新增记录不会自动上传。');
  };
  el('cloud-refresh').onclick = () => { if(mode==='cloud'){refresh();if(window.loveRefreshTodos)window.loveRefreshTodos();if(window.loveRefreshSettings)window.loveRefreshSettings();} };
  function jpegBlob(dataURL) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataURL)) throw Error('照片格式无效');
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onerror=()=>reject(Error('无法读取照片'));
      image.onload=()=>{
        const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.width,image.height));
        canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        canvas.toBlob(b=>b?resolve(b):reject(Error('照片压缩失败')),'image/jpeg',.8);
      }; image.src=dataURL;
    });
  }
  async function uploadRecord(record,legacyKey=null) {
    const user=session.user.id;
    if (legacyKey) {
      const prior=await client.from('love_memories').select('id').eq('journal_id',cfg.journalId).eq('legacy_key',legacyKey).maybeSingle();
      if(prior.error)throw prior.error;
      if(prior.data)return false;
    }
    const id=crypto.randomUUID(),photos=photosOf(record);
    if(photos.length>20)throw Error('每条回忆最多上传 20 张照片');
    const path=photos.length?cfg.journalId+'/'+id+'.jpg':null, uploaded=[];
    try {
      for(let i=0;i<photos.length;i++){
        const target=i===0?path:cfg.journalId+'/'+id+'/'+String(i).padStart(3,'0')+'.jpg';
        const blob=await jpegBlob(photos[i]);
        if(blob.size>5*1024*1024)throw Error('压缩后照片仍超过 5 MB');
        const up=await client.storage.from('love-photos').upload(target,blob,{contentType:'image/jpeg',upsert:false});
        if(up.error)throw up.error;
        uploaded.push(target);
      }
    } catch(err) {
      if(uploaded.length)await client.storage.from('love-photos').remove(uploaded);
      throw err;
    }
    const entry={id,journal_id:cfg.journalId,created_by:user,title:record.title,date:record.date,category:record.category,location:record.location||'',text:record.text,photo_path:path,legacy_key:legacyKey};
    const inserted=await client.from('love_memories').insert(entry);
    if(inserted.error){
      // Confirm whether an ambiguous network failure actually committed before cleanup.
      const verify=await client.from('love_memories').select('id').eq('id',id).eq('journal_id',cfg.journalId).maybeSingle();
      if(!verify.error && verify.data)return true;
      if(!verify.error && path)await client.storage.from('love-photos').remove(uploaded);
      if(legacyKey && inserted.error.code==='23505')return false;
      throw inserted.error;
    }
    return true;
  }
  el('memory-form').onsubmit = async e => {
    if(mode==='local')return originalSubmit(e);
    e.preventDefault();
    if(busy || loading)return;
    if(!session){requireLogin();return;}
    busy=true;const button=e.target.querySelector('[type=submit]');button.disabled=true;
    try {
      const fd=new FormData(e.target),record={title:fd.get('title'),date:fd.get('date'),category:fd.get('category'),location:fd.get('location'),text:fd.get('text')};
      if(e.target.dataset?.editId){const result=await client.from('love_memories').update({...record,version:Number(e.target.dataset.editVersion)+1}).eq('journal_id',cfg.journalId).eq('id',e.target.dataset.editId).eq('version',Number(e.target.dataset.editVersion)).select('id');if(result.error)throw result.error;if(!result.data.length)throw Error('回忆已被另一人修改或删除，请重新打开后编辑');el('editor').close();toast('共同回忆已更新 ♡');return}
      record.photos=await readPhotos(fd);
      await uploadRecord(record);el('editor').close();toast('已保存到我们的云端手帐 ♡');
    } catch(err){toast('上传失败，表单已保留：'+err.message);}
    finally{busy=false;button.disabled=false;await refresh();}
  };
  el('cloud-migrate').onclick = async () => {
    if(busy || loading || !session || mode!=='cloud')return;
    const local=state.records.slice();
    if(!local.length){toast('本机没有需要迁移的回忆');return;}
    if(!confirm('将本机 '+local.length+' 条回忆复制到共同手帐？本机原记录会保留。'))return;
    busy=true;let added=0,skipped=0,failed=0;
    try {
      for(let i=0;i<local.length;i++){
        message('正在迁移 '+(i+1)+' / '+local.length+'，请保持页面打开…');
        try {
          // Stable SHA-256 deduplicates the same exported record across devices/retries.
          const r=local[i],bytes=new TextEncoder().encode(JSON.stringify([r.id,r.title,r.date,r.category,r.location||'',r.text,photosOf(r).length>1?photosOf(r):(photosOf(r)[0]||'')]));
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
          (await uploadRecord(r,'local:'+hash))?added++:skipped++;
        } catch(err){failed++;console.warn('Migration failed for record',i+1,err.message);}
      }
    } finally {busy=false;}
    await refresh(); message('迁移完成：新增 '+added+'，已存在 '+skipped+'，失败 '+failed+'。本机原记录均保留，失败记录可重试。');
  };
  el('export').onclick = async () => {
    if(mode==='local')return originalExport();
    if(busy || loading || !session)return;
    if(!synced){toast('请先成功同步云端，再导出备份。');return;}
    busy=true;const version=epoch;
    try {
      let records=[];
      for(const r of cloudRows){
        const photos=[];
        for(const path of await albumPaths(r)){
          const d=await client.storage.from('love-photos').download(path);if(d.error)throw d.error;
          photos.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(d.data);}));
        }
        records.push({id:r.id,title:r.title,date:r.date,category:r.category,location:r.location,text:r.text,photos,...(photos.length?{photo:photos[0]}:{})});
      }
      if(version!==epoch)throw Error('登录状态已改变，请重试');
      const todoBackup=window.loveTodoBackup?await window.loveTodoBackup():{checks:state.checks,customTodos:state.customTodos};
      if(version!==epoch)throw Error('登录状态已改变，请重试');
      const url=URL.createObjectURL(new Blob([JSON.stringify({records,anniversary:window.loveSharedAnniversary?window.loveSharedAnniversary():state.anniversary,...todoBackup},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='我们的小日子-云端备份.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('云端备份已导出（含照片）');
    }catch(err){toast('导出失败：'+err.message);}finally{busy=false;}
  };
  el('import').onclick = () => {
    if(mode==='cloud'){toast('请先切换到本机手帐导入备份，再点击“迁移本机回忆”。');return;}
    originalImport();
  };
  el('add').addEventListener('click',()=>{el('record-storage-hint').textContent=mode==='cloud'?'保存后同步到两人的共同手帐。':'当前保存到本机；可登录云端后迁移。';});
  display();
  if(!configured()){message('本机模式 · 云端待连接。现有照片和文字均保留。');return;}
  if(!window.supabase){message('云端组件加载失败，当前仍可使用本机手帐。');return;}
  try{client=window.supabase.createClient(cfg.url,cfg.publishableKey);}catch(err){message('云端配置无效：'+err.message);return;}
  client.auth.onAuthStateChange((event,next)=>{
    if(event==='SIGNED_OUT' || (session && next && session.user.id!==next.user.id)){
      epoch++;cloudRows=[];mode='local';el('detail').close();el('editor').close();
    }
    session=next;display();
    // Keep asynchronous database work outside Supabase's auth callback.
    if(event==='SIGNED_OUT')message('已退出云端，当前显示本机手帐。');
  });
  client.auth.getSession().then(async r=>{
    if(r.error){message('恢复登录失败：'+r.error.message);return;}
    session=r.data.session;
    if(session){mode='cloud';epoch++;display();await refresh();}
    else message('登录后可访问两人的共同手帐；当前为本机模式。');
  }).catch(err=>message('连接失败：'+err.message));
  setInterval(()=>{if(!document.hidden && mode==='cloud')refresh();},120000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && mode==='cloud')refresh();});
})();
