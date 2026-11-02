/* Small shared-document store. Version checks prevent overwriting another edit. */
window.createJournalStore = (client,journalId) => {
  async function read(key) {
    const r=await client.from('love_settings').select('value,version').eq('journal_id',journalId).eq('key',key).maybeSingle();
    if(r.error)throw r.error;
    return r.data||{value:null,version:0};
  }
  async function write(key,value,version) {
    let q;
    if(version===0) q=client.from('love_settings').insert({journal_id:journalId,key,value,version:1});
    else q=client.from('love_settings').update({value,version:version+1}).eq('journal_id',journalId).eq('key',key).eq('version',version);
    const r=await q.select('value,version');
    if(r.error){if(r.error.code==='23505')throw Error('另一人已修改此内容，请刷新后重新编辑');throw r.error}
    if(!r.data?.length)throw Error('另一人已修改此内容，或当前无写入权限，请刷新后重新编辑');
    return r.data[0];
  }
  return {read,write};
};
