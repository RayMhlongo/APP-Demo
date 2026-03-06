(function(){
  const oldRender=window.renderDash;
  window.renderDash=function(){
    oldRender();
    const totalCredit=DB.customers.reduce((s,c)=>s+Math.max(0,Number(c.credit||0)),0);
    const dash=document.getElementById('sc-dash');
    if(!dash) return;
    let card=document.getElementById('creditDashCard');
    if(!card){
      card=document.createElement('div');
      card.id='creditDashCard';
      card.className='card';
      card.innerHTML='<div class="card-title">Customer Credit Pool</div><div class="stat mint"><div class="n" id="d-credit">R0</div><div class="l">Outstanding credit</div></div>';
      const anchor=dash.querySelector('.card');
      if(anchor) dash.insertBefore(card,anchor); else dash.appendChild(card);
    }
    const el=document.getElementById('d-credit');
    if(el) el.textContent='R'+Math.round(totalCredit);
  };
})();
