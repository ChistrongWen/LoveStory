(() => {
  const el=id=>document.getElementById(id),defaults={notes:notes.slice(),anniversary:state.anniversary,music:audio.src};
  let source=null,store=null,epoch=0,ready=false,busy=false,pending=null,docs={},editVersion=0,editEpoch=0,musicPath='',musicExpires=0;
  const isCloud=()=>source?.mode==='cloud'&&source.session&&source.client;
  const localAnniversary=el('config-form').onsubmit,localAudio=el('audioFile').onchange,localSettings=el('settings').onclick;
  function status(s){el('shared-settings-status').textContent=s}
  function controls(){el('edit-notes').disabled=!isCloud()||!ready||busy;el('share-anniversary').hidden=!isCloud()||!state.anniversary;}
  function restore(){el('shared-places-preview').innerHTML='<p>登录共同手账后，一起收藏旅行地点。</p>';notes=defaults.notes.slice();noteIndex=0;el('little-note').innerText=notes[0];applyAnniversary(state.anniversary);audio.pause();audio.src=defaults.music;musicPath='';musicExpires=0;}
  function applyAnniversary(value){
    if(!value){el('since').textContent='设置我们的纪念日';el('days').textContent='把故事开始的那天，记在这里。';return}
    const start=new Date(value+'T00:00:00'),today=new Date();today.setHours(0,0,0,0);const days=Math.floor((today-start)/864e5);
    el('since').textContent=value.replaceAll('-','.');el('days').textContent=days>=0?`一起走过 ${days+1} 天，还想一起走很远。`:`距离故事开始，还有 ${-days} 天。`;
  }
  async function refresh(){
    if(!isCloud()||busy)return;if(pending)return pending;
    const token=epoch,current=source,currentStore=store;
    const run=(async()=>{try{
      const member=await current.client.from('love_members').select('journal_id').eq('journal_id',current.journalId).eq('user_id',current.session.user.id).maybeSingle();if(member.error)throw member.error;if(!member.data)throw Error('当前账号尚未加入共同手账');
      const entries=await Promise.all(['anniversary','notes','music','places'].map(async key=>[key,await currentStore.read(key)]));
      if(token!==epoch)return;docs=Object.fromEntries(entries);ready=true;
      const sharedPlaces=Array.isArray(docs.places.value)?docs.places.value:[];
      el('shared-places-preview').innerHTML=sharedPlaces.length?sharedPlaces.map(p=>`<a href="travel-map.html">♡ ${esc(p.name)}</a>`).join(''):'<p>共同地图还是空的，打开世界地图添加第一站吧。</p>';
      applyAnniversary(typeof docs.anniversary.value==='string'?docs.anniversary.value:'');
      const nextNotes=docs.notes.value;
      notes=Array.isArray(nextNotes)&&nextNotes.length&&nextNotes.every(s=>typeof s==='string')?nextNotes:defaults.notes.slice();noteIndex%=notes.length;el('little-note').innerText=notes[noteIndex];
      const path=docs.music.value?.path||'';
      if(path&&(path!==musicPath||Date.now()>musicExpires)){
        const r=await current.client.storage.from('love-media').createSignedUrl(path,3600);if(r.error)throw r.error;if(token!==epoch)return;
        const same=path===musicPath,time=audio.currentTime,playing=!audio.paused;audio.src=r.data.signedUrl;
        if(same){audio.currentTime=time;if(playing)audio.play().catch(()=>{})}
        musicPath=path;musicExpires=Date.now()+45*60*1000;
      }else if(!path&&musicPath){audio.pause();audio.src=defaults.music;musicPath='';}
      status('纪念日、便签与背景音乐 · 两人共享 · 每 2 分钟刷新');controls();
    }catch(e){if(token===epoch){ready=false;controls();status('共享设置同步失败：'+e.message)}}})();
    pending=run;try{await run}finally{if(pending===run)pending=null}
  }
  async function write(key,value,version,onSuccess){
    if(!isCloud()||!ready||busy||editEpoch!==epoch){toast('请等待同步完成，或重新打开编辑窗口');return}
    const token=epoch,currentStore=store;busy=true;controls();
    try{const result=await currentStore.write(key,value,version);if(token!==epoch)return;docs[key]=result;onSuccess();toast('已保存到共同手账 ♡')}
    catch(e){if(token===epoch)toast('保存失败，输入已保留：'+e.message)}
    finally{if(token===epoch){busy=false;controls();await refresh()}}
  }
  el('settings').onclick=()=>{
    if(!isCloud())return localSettings();if(!ready||busy){toast('请先成功同步共同设置');return}
    editVersion=docs.anniversary.version;editEpoch=epoch;el('config').querySelector('[name=anniversary]').value=docs.anniversary.value||'';el('config').showModal();
  };
  el('config-form').onsubmit=e=>{
    if(!isCloud())return localAnniversary(e);e.preventDefault();const value=new FormData(e.target).get('anniversary');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
    return write('anniversary',value,editVersion,()=>el('config').close());
  };
  el('share-anniversary').onclick=()=>{if(!state.anniversary||!ready)return;editEpoch=epoch;return write('anniversary',state.anniversary,docs.anniversary.version,()=>{})};
  el('edit-notes').onclick=()=>{if(!ready||busy)return;editVersion=docs.notes.version;editEpoch=epoch;el('notes-text').value=notes.join('\n');el('notes-editor').showModal()};
  el('notes-form').onsubmit=e=>{e.preventDefault();const value=el('notes-text').value.split('\n').map(s=>s.trim()).filter(Boolean);if(!value.length||value.length>50||value.some(s=>s.length>300)){toast('请填写 1–50 条便签，每条不超过 300 字');return}return write('notes',value,editVersion,()=>el('notes-editor').close())};
  el('audioFile').onchange=async e=>{
    if(!isCloud())return localAudio(e);const file=e.target.files[0];if(!file)return;
    if(!ready||busy){toast('请先等待共享设置同步完成');e.target.value='';return}
    if(file.size>20*1024*1024||!/^audio\/(mpeg|mp4|x-m4a|wav|x-wav|ogg|webm)$/.test(file.type)){toast('请选择不超过 20 MB 的 MP3、M4A、WAV、OGG 或 WebM 音频');e.target.value='';return}
    const token=epoch,current=source,currentStore=store,version=docs.music.version;
    const path=current.journalId+'/'+crypto.randomUUID();busy=true;controls();status('正在上传共同背景音乐…');
    try{
      const up=await current.client.storage.from('love-media').upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;
      if(token!==epoch)return;
      await currentStore.write('music',{path,name:file.name},version);
      if(token===epoch)toast('背景音乐已共享，两个人都可以播放 ♫');
    }catch(err){if(token===epoch)toast('音乐保存失败：'+err.message)}
    finally{e.target.value='';if(token===epoch){busy=false;controls();await refresh()}}
  };
  window.loveSettingsContext=next=>{
    const changed=!source||source.client!==next.client||source.mode!==next.mode||source.session?.user.id!==next.session?.user.id;source=next;
    if(!changed)return;epoch++;ready=false;busy=false;pending=null;docs={};
    el('config').close();el('notes-editor').close();
    if(isCloud()){store=window.createJournalStore(source.client,source.journalId);restore();refresh()}
    else{store=null;restore();status('登录共同手账后，可共享纪念日、便签和背景音乐')}
    controls();
  };
  window.loveRefreshSettings=refresh;
  window.loveSharedAnniversary=()=>isCloud()&&ready?(docs.anniversary.value||''):state.anniversary;
  setInterval(()=>{if(!document.hidden)refresh()},120000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  controls();
})();
