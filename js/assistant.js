(function(){
  const oldAnswer=typeof window.assistantAnswer==='function'
    ? window.assistantAnswer
    : function(){return 'Assistant is warming up. Try again in a second.';};

  window.assistantAnswer=function(question){
    try{
      const q=String(question||'').toLowerCase();
      if(q.includes('credit')&&q.includes('total')){
        const wallets=Array.isArray(DB.wallets)?DB.wallets:[];
        const total=wallets.reduce((s,w)=>s+Math.max(0,Number(w.balance||0)),0);
        return 'Total wallet credit in the system is R'+Math.round(total)+'.';
      }
      if(q.includes('credit')&&q.includes('top')){
        const top=[...(Array.isArray(DB.wallets)?DB.wallets:[])].sort((a,b)=>Number(b.balance||0)-Number(a.balance||0)).slice(0,3)
          .map(w=>(w.label||w.id)+': R'+Math.max(0,Number(w.balance||0))).join(', ');
        return top?('Top wallet balances: '+top):'No wallet balances found.';
      }
      if(q.includes('blank qr')||q.includes('reverse qr')){
        return 'Use Sell -> Generate Blank QR. Scan once, then complete customer details to activate.';
      }
      const ans=oldAnswer(question);
      return (typeof ans==='string'&&ans.trim())?ans:'I could not generate a reply yet. Try one of the quick buttons.';
    }catch(err){
      console.error('assistantAnswer extension failed',err);
      return 'Assistant hit an error while answering. Please try again.';
    }
  };

  if(typeof window.askAssistant!=='function'){
    window.askAssistant=function(){
      const input=document.getElementById('assistantInput');
      const host=document.getElementById('assistantChat');
      const q=String(input?.value||'').trim();
      if(!q||!host)return;
      const user=document.createElement('div');
      user.className='assistant-msg user';
      user.textContent=q;
      host.appendChild(user);
      const bot=document.createElement('div');
      bot.className='assistant-msg bot';
      bot.textContent=window.assistantAnswer(q);
      host.appendChild(bot);
      host.scrollTop=host.scrollHeight;
      if(input)input.value='';
    };
  }
})();
