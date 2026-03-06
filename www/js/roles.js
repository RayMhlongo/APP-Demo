(function(){
  const TAB_ACCESS={
    owner:['sell','loyalty','dash','lab','customers','broadcast','report','settings'],
    manager:['sell','loyalty','dash','lab','customers','broadcast','report'],
    seller:['sell','loyalty','customers']
  };

  function role(){return (DB&&DB.settings&&DB.settings.role)||'owner';}
  function allowed(name){const list=TAB_ACCESS[role()]||TAB_ACCESS.owner;return list.includes(name);}

  const oldCanAccess=window.canAccessTab;
  window.canAccessTab=function(name){
    if(oldCanAccess){try{return oldCanAccess(name)&&allowed(name);}catch(e){}}
    return allowed(name);
  };

  const oldGo=window.go;
  window.go=function(name,btn){
    if(!allowed(name)){
      toast('Role does not allow this section','er');
      return;
    }
    return oldGo(name,btn);
  };

  const oldApply=window.applyRolePermissions;
  window.applyRolePermissions=function(){
    if(oldApply) oldApply();
    const roleName=role();
    document.querySelectorAll('.nav .nav-btn').forEach(btn=>{
      const onclick=btn.getAttribute('onclick')||'';
      const m=onclick.match(/go\('([^']+)'/);
      const tab=m?m[1]:'';
      const ok=(TAB_ACCESS[roleName]||TAB_ACCESS.owner).includes(tab);
      btn.style.display=ok?'':'none';
    });
  };

  const guard=(name,fn)=>function(...args){
    if(!allowed(name)){
      toast('Permission blocked for your role','er');
      return;
    }
    return fn.apply(this,args);
  };
  if(window.saveSettings) window.saveSettings=guard('settings',window.saveSettings);
  if(window.startBroadcast) window.startBroadcast=guard('broadcast',window.startBroadcast);
})();
