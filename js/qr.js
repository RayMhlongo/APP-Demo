(function(){
  const BLANK_PREFIX='CC-BLANK-';

  function setScanFeedback(msg,type=''){
    const el=document.getElementById('scanFeedback');
    if(!el)return;
    el.textContent=msg||'';
    el.className='scan-feedback'+(type?(' '+type):'');
  }

  function normalizeDigits(v){return String(v||'').replace(/\D/g,'');}
  function formatSouthAfricanPhone(v){
    let d=normalizeDigits(v);
    if(d.startsWith('27')) d=d.slice(2);
    if(d.startsWith('0')) d=d.slice(1);
    d=d.slice(0,9);
    const p1=d.slice(0,2),p2=d.slice(2,5),p3=d.slice(5,9);
    return '+27'+(p1?(' '+p1):'')+(p2?(' '+p2):'')+(p3?(' '+p3):'');
  }
  window.formatSouthAfricanPhone=formatSouthAfricanPhone;

  function bindPhoneFormat(id){
    const el=document.getElementById(id);
    if(!el)return;
    if(!el.value)el.value='+27 ';
    el.addEventListener('input',()=>{el.value=formatSouthAfricanPhone(el.value);});
    el.addEventListener('focus',()=>{if(!el.value.trim())el.value='+27 ';});
  }

  window.generateReverseQR=function(){
    const role=(DB&&DB.settings&&DB.settings.role)||'owner';
    if(role==='seller'){
      toast('Only owner/manager can generate blank QR','er');
      return;
    }
    const token=BLANK_PREFIX+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    const tmp={displayName:'Blank Activation',childName:'Scan to register',profileType:'child',qrId:token};
    showQRCode(tmp,true);
    setScanFeedback('Blank QR generated. Print/share then scan once to activate.','ok');
  };

  const oldShow=window.showQRCode;
  window.showQRCode=function(cust,isBlank){
    const popupName=document.getElementById('qrPopupName');
    if(popupName){
      if(isBlank){
        popupName.textContent='Blank Activation QR';
      }else{
        const name=(typeof window.customerDisplayName==='function'?window.customerDisplayName(cust):String(cust.displayName||cust.childName||cust.parentName||'Customer'));
        const sub=(typeof window.customerSubtitle==='function'?window.customerSubtitle(cust):String(cust.childName||''));
        popupName.textContent=name+' • '+sub;
      }
    }
    if(typeof oldShow==='function'){
      return oldShow(cust,isBlank);
    }
  };

  const oldHandle=window.handleScan;
  window.handleScan=function(qrId){
    const id=String(qrId||'').trim();
    if(id.startsWith(BLANK_PREFIX)){
      hide('v-qr');
      show('v-new-customer');
      const q=document.getElementById('nc-qrid'); if(q) q.value=id;
      const type=document.getElementById('nc-type'); if(type) type.value='child';
      if(typeof window.prepCustomerForm==='function') window.prepCustomerForm('nc');
      setScanFeedback('Blank QR scanned. Complete profile to activate.','ok');
      document.getElementById('nc-cname')?.focus();
      return;
    }
    const found=DB.customers.find(c=>String(c.qrId||'').trim()===id);
    if(found)setScanFeedback('Scan successful','ok');
    else setScanFeedback('QR not found, creating new profile','er');
    if(typeof oldHandle==='function')return oldHandle(id);
  };

  DB.customers.forEach(c=>{
    if(c.phone)c.phone=formatSouthAfricanPhone(c.phone);
  });
  saveLocal();
  bindPhoneFormat('nc-phone');
  bindPhoneFormat('c-phone');
})();
