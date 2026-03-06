(function(){
  const oldRender=window.renderLoy;
  window.renderLoy=function(){
    oldRender();
    const parent=document.getElementById('sc-loyalty');
    if(!parent) return;
    let note=document.getElementById('loy-credit-note');
    if(!note){
      note=document.createElement('div');
      note.id='loy-credit-note';
      note.className='card';
      note.style.marginTop='10px';
      parent.appendChild(note);
    }
    note.innerHTML='<div class="card-title">Credit Balances</div>'+DB.customers.map(c=>'<div class="srow"><div><div class="sl">'+(c.parentName||'Unknown')+' • '+(c.childName||'')+'</div></div><span class="badge mint">R'+Math.max(0,Number(c.credit||0))+'</span></div>').join('');
  };

  const oldCard=window.showLoyaltyCard;
  window.showLoyaltyCard=function(cust){
    oldCard(cust);
    const root=document.getElementById('loyaltyCardContent');
    if(!root || root.querySelector('.credit-pill')) return;
    const extra=document.createElement('div');
    extra.style.marginTop='8px';
    extra.innerHTML='<span class="credit-pill">Credit Balance: R'+Math.max(0,Number(cust.credit||0))+'</span>';
    root.appendChild(extra);
  };
})();
