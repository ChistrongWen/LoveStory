(() => {
  const el=id=>document.getElementById(id),cfg=window.LOVE_SUPABASE;
  let client,session=null,store,doc={value:null,version:0},ready=false,busy=false,epoch=0,pending=null,authLoaded=false;
  let localPlaces=places.map(p=>({...p}));
  const cloud=()=>!!session;
  function controls(){el('add-place').disabled=cloud()&&(!ready||busy);el('share-local-places').hidden=!cloud();el('share-local-places').disabled=!ready||busy;}
  async function refresh(){
    if(!session||busy)return;if(pending)return pending;const token=epoch;
    const run=(async()=>{try{
      const m=await client.from('love_members').select('journal_id').eq('journal_id',cfg.journalId).eq('user_id',session.user.id).maybeSingle();if(m.error)throw m.error;if(!m.data)throw Error('账号尚未加入共同手账');
      let next=await store.read('places');if(token!==epoch)return;
      // Seed only a missing document; an intentionally empty map stays empty.
      if(next.value===null&&next.version===0){
        try{next=await store.write('places',initial.map(p=>({...p})),0)}
        catch(error){next=await store.read('places');if(next.value===null)throw error}
        if(token!==epoch)return;
      }
      const value=next.value||[];if(!Array.isArray(value)||!value.every(valid))throw Error('云端地点数据格式不正确');value.forEach(destination);
      doc=next;places=value;ready=true;render();el('places-storage').textContent='共同旅行地图 · 两人可编辑 · 每 2 分钟刷新';
    }catch(e){if(token===epoch){ready=false;places=[];render();el('places-storage').textContent='地图同步失败：'+e.message}}
    finally{if(token===epoch)controls()}})();pending=run;try{await run}finally{if(pending===run)pending=null}
  }
  window.loveMapIsCloud=cloud;
  window.loveMapVersion=()=>doc.version;
  window.loveMapPersist=async(next,version=doc.version)=>{
    if(!cloud()){const ok=localPersist(next);if(ok)localPlaces=next.map(p=>({...p}));return ok}
    if(!ready||busy||pending){notice('请等待共同地图同步完成');return false}
    if(next.length>1000||!next.every(valid)){notice('地点格式无效或数量超过 1000');return false}
    const token=epoch;busy=true;controls();
    try{const result=await store.write('places',next,version);if(token!==epoch)return false;doc=result;places=next;render();notice('地点已同步到共同地图 ♡');return true}
    catch(e){if(token===epoch)notice('保存失败：'+e.message);return false}
    finally{if(token===epoch){busy=false;controls();await refresh()}}
  };
  el('refresh-places').onclick=refresh;
  el('share-local-places').onclick=()=>{
    const merged=places.slice();for(const p of localPlaces)if(!merged.some(x=>x.id===p.id))merged.push(p);
    return window.loveMapPersist(merged);
  };
  async function auth(next){
    if(authLoaded&&session?.user.id===next?.user.id)return;authLoaded=true;session=next;epoch++;ready=false;busy=false;pending=null;doc={value:null,version:0};el('place-editor').close();
    if(session){places=[];render();await refresh()}
    else{places=localPlaces.map(p=>({...p}));render();el('places-storage').textContent='本机地图 · 请回到手账登录后使用两人的共同地图';controls()}
  }
  if(!cfg||!window.supabase){el('places-storage').textContent='云端组件未加载，请检查网络';return}
  client=window.supabase.createClient(cfg.url,cfg.publishableKey);store=window.createJournalStore(client,cfg.journalId);
  client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>auth(next),0)});
  client.auth.getSession().then(r=>{if(r.error)throw r.error;return auth(r.data.session)}).catch(e=>{el('places-storage').textContent='登录恢复失败：'+e.message});
  setInterval(()=>{if(!document.hidden)refresh()},120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});controls();
})();
