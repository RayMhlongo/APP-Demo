(function(){
  const OPLOG_KEY=(window.STORE_KEY||'cathdelCreamyV3')+'-oplog';
  const oldQueue=window.queueOperation;
  const oldFlush=window.flushOutbox;
  const oldPushAction=window.pushAction;
  let flushing=false;

  function loadOpLog(){try{return JSON.parse(localStorage.getItem(OPLOG_KEY)||'{}');}catch(e){return {};}}
  function saveOpLog(v){try{localStorage.setItem(OPLOG_KEY,JSON.stringify(v));}catch(e){}}
  function fingerprint(action,payload){
    const base=JSON.stringify([action,payload&&payload.id,payload&&payload.date,payload&&payload.parentName,payload&&payload.product,payload&&payload.total,payload&&payload.qrId,payload&&payload.key,payload&&payload.value]);
    let h=0; for(let i=0;i<base.length;i++) h=((h<<5)-h)+base.charCodeAt(i)|0;
    return 'op_'+Math.abs(h);
  }

  window.queueOperation=function(action,payload){
    const opId=(payload&&payload._clientOpId)||fingerprint(action,payload||{});
    const outbox=(window.OUTBOX||[]);
    const exists=outbox.some(x=>(x&&x._clientOpId)===opId||fingerprint(x.action,x.payload||{})===opId);
    if(exists) return;
    const copy=Object.assign({},payload||{}, {_clientOpId:opId});
    return oldQueue(action,copy);
  };

  window.pushAction=async function(action,payload,showStatus=true){
    const opId=(payload&&payload._clientOpId)||fingerprint(action,payload||{});
    const log=loadOpLog();
    if(log[opId]) return {ok:true,skipped:true};
    const copy=Object.assign({},payload||{}, {_clientOpId:opId});
    const res=await oldPushAction(action,copy,showStatus);
    if(res&&res.ok){log[opId]=Date.now(); saveOpLog(log);}    
    return res;
  };

  window.flushOutbox=async function(){
    if(flushing) return;
    flushing=true;
    try{return await oldFlush();}
    finally{flushing=false;}
  };
})();
