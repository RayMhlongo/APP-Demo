(function(){
  const oldAnswer=window.assistantAnswer;
  window.assistantAnswer=function(question){
    const q=String(question||'').toLowerCase();
    if(q.includes('credit')&&q.includes('total')){
      const total=DB.customers.reduce((s,c)=>s+Math.max(0,Number(c.credit||0)),0);
      return 'Total customer credit on accounts is R'+Math.round(total)+'.';
    }
    if(q.includes('credit')&&q.includes('top')){
      const top=[...DB.customers].sort((a,b)=>Number(b.credit||0)-Number(a.credit||0)).slice(0,3)
        .map(c=>(c.childName||c.parentName)+': R'+Math.max(0,Number(c.credit||0))).join(', ');
      return top?('Top credit balances: '+top):'No credit balances found.';
    }
    if(q.includes('blank qr')||q.includes('reverse qr')){
      return 'Use Sell -> Generate Blank QR. Scan that QR once and complete profile fields to activate the customer.';
    }
    return oldAnswer(question);
  };
})();
