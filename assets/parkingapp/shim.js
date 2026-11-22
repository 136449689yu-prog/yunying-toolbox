/* 停车工作台静态展示垫片：拦截 /api/*，全部读内嵌快照 */
(function(){
  var S = window.__PK_SNAP__ || {};
  function pathOnly(u){ return (u||'').split('?')[0]; }
  function payload(method, path){
    method=(method||'GET').toUpperCase();
    if(method!=='GET'){
      // 写操作：模拟成功，前端随后会重新 GET 拿到快照（数据不变）
      if(path.indexOf('/api/repair')>-1 && method==='POST') return {id:999,status:'待处理'};
      if(path.indexOf('/api/')>-1) return {ok:true};
    }
    var p=pathOnly(path);
    if(p==='/api/overview') return S.overview;
    if(p==='/api/equipment') return S.equipment;
    if(p==='/api/repair') return S.repair;
    if(p==='/api/revenue/daily') return S.revenue_daily;
    if(p==='/api/revenue/monthly') return S.revenue_monthly;
    if(p==='/api/revenue/sources') return S.revenue_sources;
    if(p==='/api/revenue/lots') return S.revenue_lots;
    if(p==='/api/parking/turnover') return S.turnover;
    if(p==='/api/parking/occupancy') return S.occupancy;
    if(p==='/api/parking/spaces') return S.spaces;
    return null;
  }
  function resp(data, ok){
    ok = ok!==false;
    return Promise.resolve({
      ok: ok,
      status: ok?200:400,
      json: function(){ return Promise.resolve(data); }
    });
  }
  var orig = window.fetch;
  window.fetch = function(url, opts){
    var u = (typeof url==='string')?url:(url&&url.url)||'';
    if(u.indexOf('/api/')>-1){
      var method=(opts&&opts.method)||'GET';
      var data=payload(method,u);
      if(data!==null) return resp(data);
      // 兜底：未覆盖的 path 返回空数组
      return resp([]);
    }
    return orig ? orig.apply(window,arguments) : Promise.reject(new Error('no fetch'));
  };
})();
