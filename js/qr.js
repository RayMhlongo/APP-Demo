(function(){
  const BLANK_PREFIX='CC-BLANK-';

  function setScanFeedback(msg,type=''){
    const el=document.getElementById('scanFeedback');
    if(!el) return;
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
    if(!el) return;
    if(!el.value) el.value='+27 ';
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
    const tmp={parentName:'Blank Activation',childName:'Scan to register',qrId:token};
    showQRCode(tmp,true);
    setScanFeedback('Blank QR generated. Print/share then scan once to activate.','ok');
  };

  window.showQRCode=function(cust,isBlank){
    const popupName=document.getElementById('qrPopupName');
    if(popupName){
      popupName.textContent=isBlank?'Blank Activation QR':((cust.parentName||'Unknown Parent')+' • '+(cust.childName||'No child name'));
    }
    const container=document.getElementById('qrCodeDisplay');
    if(!container) return;
    container.innerHTML='';
    if(typeof QRCode==='undefined'){
      container.innerHTML='<div class="empty" style="padding:12px"><p>QR generator unavailable offline.</p><p style="font-size:11px">ID: '+(cust.qrId||'')+'</p></div>';
      document.getElementById('qrOverlay').classList.add('show');
      return;
    }
    new QRCode(container,{text:cust.qrId,width:220,height:220,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
    document.getElementById('qrOverlay').classList.add('show');
  };

  const oldHandle=window.handleScan;
  window.handleScan=function(qrId){
    const id=String(qrId||'').trim();
    if(id.startsWith(BLANK_PREFIX)){
      hide('v-qr');
      show('v-new-customer');
      const q=document.getElementById('nc-qrid'); if(q) q.value=id;
      setScanFeedback('Blank QR scanned. Complete profile to activate.','ok');
      document.getElementById('nc-cname')?.focus();
      return;
    }
    const found=DB.customers.find(c=>c.qrId===id);
    if(found){
      setScanFeedback('Scan successful','ok');
    }else{
      setScanFeedback('QR not found, creating new profile','er');
    }
    return oldHandle(id);
  };

  window.registerNewFromScan=function(){
    const pnRaw=(document.getElementById('nc-pname')?.value||'').trim();
    const parentName=pnRaw||'Unknown Parent';
    const childName=(document.getElementById('nc-cname')?.value||'').trim();
    if(!childName){toast('Child name required','er');return;}
    const phone=formatSouthAfricanPhone(document.getElementById('nc-phone')?.value||'');
    const credit=Math.max(0,Number(document.getElementById('nc-credit')?.value||0));
    const qrId=(document.getElementById('nc-qrid')?.value)||('CC-'+Date.now());
    const cust={
      id:'P-'+String(DB.customers.length+1).padStart(3,'0'),
      qrId,parentName,childName,
      grade:(document.getElementById('nc-grade')?.value||'').trim(),
      phone,credit
    };
    DB.customers.push(cust);saveLocal();pushCustomer(cust);
    hide('v-new-customer');toast('Customer registered','ok');pickCust(cust);
  };

  window.saveNewCust=function(){
    const parentName=((document.getElementById('c-pname')?.value||'').trim()||'Unknown Parent');
    const childName=(document.getElementById('c-cname')?.value||'').trim();
    if(!childName){toast('Child name required','er');return;}
    const phone=formatSouthAfricanPhone(document.getElementById('c-phone')?.value||'');
    const credit=Math.max(0,Number(document.getElementById('c-credit')?.value||0));
    const cust={id:'P-'+String(DB.customers.length+1).padStart(3,'0'),
      qrId:'CC-P-'+String(DB.customers.length+1).padStart(3,'0')+'-'+Date.now(),
      parentName,childName,
      grade:(document.getElementById('c-grade')?.value||'').trim(),phone,credit};
    DB.customers.push(cust);saveLocal();pushCustomer(cust);
    ['c-pname','c-cname','c-grade','c-phone','c-credit'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='c-credit'?'0':'';});
    toggleAddCust();renderCusts();toast('Customer saved','ok');
    setTimeout(()=>showQRCode(cust),250);
  };

  const oldPick=window.pickCust;
  window.pickCust=function(c){
    oldPick(c);
    const current=DB.customers.find(x=>x.id===c.id)||c;
    const creditEl=document.getElementById('coCredit');
    if(creditEl){creditEl.textContent='Credit: R'+Math.max(0,Number(current.credit||0));}
  };

  DB.customers.forEach(c=>{if(typeof c.credit!=='number')c.credit=0; if(c.phone)c.phone=formatSouthAfricanPhone(c.phone);});
  saveLocal();
  bindPhoneFormat('nc-phone');
  bindPhoneFormat('c-phone');
})();
