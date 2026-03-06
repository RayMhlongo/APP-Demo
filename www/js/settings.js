(function(){
  window.runStressSuite=async function(){
    const result={startedAt:new Date().toISOString(),queueBefore:(OUTBOX||[]).length,errors:[]};
    try{
      const originalRole=DB.settings.role;
      DB.settings.role='seller';
      if(canAccessTab('settings')) result.errors.push('Seller should not access settings');
      DB.settings.role=originalRole;

      handleScan('CC-BLANK-test-token');

      if(DB.customers.length){
        const c=DB.customers[0];
        c.credit=Math.max(0,Number(c.credit||0))+200;
        for(let i=0;i<120;i++){
          DB.orders.push({id:'T-'+Date.now()+'-'+i,date:today(),parentName:c.parentName,product:(DB.products[0]||{name:'Test'}).name,qty:1,unitPrice:1,total:1,payment:'Cash',status:'Paid'});
        }
      }

      for(let i=0;i<120;i++) queueOperation('addOrder',{id:'Q-'+i,date:today(),parentName:'Stress',product:'X',qty:1,unitPrice:1,total:1,payment:'Cash'});
      const pre=(OUTBOX||[]).length;
      await flushOutbox();
      await flushOutbox();
      const post=(OUTBOX||[]).length;
      if(post>pre) result.errors.push('Outbox grew after duplicate flush');

      const ans=assistantAnswer('total credit');
      if(!ans||ans.length<3) result.errors.push('Assistant returned empty answer');
      saveLocal();
    }catch(e){
      result.errors.push(String(e&&e.message||e));
    }
    result.queueAfter=(OUTBOX||[]).length;
    result.passed=result.errors.length===0;
    result.finishedAt=new Date().toISOString();
    console.log('Cathdel stress suite:',result);
    toast(result.passed?'Stress suite passed':'Stress suite found issues',result.passed?'ok':'er');
    return result;
  };

  function clampNumericInput(id,min,max){
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('change',()=>{
      let v=Number(el.value||0);
      if(Number.isNaN(v)) v=min;
      v=Math.max(min,Math.min(max,v));
      el.value=String(v);
    });
  }
  clampNumericInput('c-credit',0,100000);
  clampNumericInput('nc-credit',0,100000);

  if((location.search||'').includes('stress=1')){
    window.setTimeout(async ()=>{
      const res=await window.runStressSuite();
      let out=document.getElementById('stressResult');
      if(!out){
        out=document.createElement('pre');
        out.id='stressResult';
        out.style.whiteSpace='pre-wrap';
        out.style.fontSize='11px';
        out.style.padding='10px';
        out.style.margin='10px';
        out.style.background='#fff';
        out.style.border='1px solid #ddd';
        document.body.prepend(out);
      }
      out.textContent=JSON.stringify(res,null,2);
    },1200);
  }
})();
