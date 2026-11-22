/* 停车工作台静态展示垫片：拦截 /api/*，全部读内嵌快照。
   2026-11-22 修复：支持时段查询、设备筛选、改状态写回，交互可见变化。 */
(function(){
  var S = window.__PK_SNAP__ || {};
  // 可写副本：改状态后前端重新 GET 能看到新值
  var equipment = (S.equipment || []).map(function(e){ return Object.assign({}, e); });
  var spacesBase = S.spaces || {};
  var occ = S.occupancy || [];

  function pathOnly(u){ return (u||'').split('?')[0]; }
  function query(u){
    var out = {};
    var q = (u||'').split('?')[1] || '';
    q.split('&').forEach(function(pair){
      var kv = pair.split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }
  function resp(data, ok){
    ok = ok !== false;
    return Promise.resolve({
      ok: ok,
      status: ok ? 200 : 400,
      json: function(){ return Promise.resolve(data); }
    });
  }

  // 按时段重算车位快照：占用数取 occupancy[hour]，其余车位按原顺序补位
  function spacesForHour(hour){
    var h = Number(hour);
    if (!isFinite(h) || h < 0 || h > 23) h = 10;
    var row = occ[h] || occ[10] || {occupied: 141, free: 3, spaces: 144};
    var total = (spacesBase.items || []).length || 144;
    var occupied = Math.max(0, Math.min(total, Math.round(row.occupied)));
    var items = (spacesBase.items || []).map(function(it, idx){
      return Object.assign({}, it, { occupied: idx < occupied });
    });
    return {
      day: spacesBase.day || '2026-11-20',
      hour: h,
      spaces: total,
      occupied: occupied,
      free: total - occupied,
      items: items
    };
  }

  function filteredEquipment(q){
    var rows = equipment;
    if (q.status) rows = rows.filter(function(e){ return e.status === q.status; });
    if (q.category) rows = rows.filter(function(e){ return e.category === q.category; });
    return rows;
  }

  function payload(method, u){
    method = (method || 'GET').toUpperCase();
    var p = pathOnly(u), q = query(u);
    if (method !== 'GET') {
      if (p.indexOf('/api/repair') > -1 && method === 'POST') return {id: 999, status: '待处理'};
      if (p.indexOf('/api/') > -1) return {ok: true};
    }
    if (p === '/api/overview') return S.overview;
    if (p === '/api/equipment') return filteredEquipment(q);
    if (p === '/api/repair') return S.repair;
    if (p === '/api/revenue/daily') return S.revenue_daily;
    if (p === '/api/revenue/monthly') return S.revenue_monthly;
    if (p === '/api/revenue/sources') return S.revenue_sources;
    if (p === '/api/revenue/lots') return S.revenue_lots;
    if (p === '/api/parking/turnover') return S.turnover;
    if (p === '/api/parking/occupancy') return S.occupancy;
    if (p === '/api/parking/spaces') return spacesForHour(q.hour);
    return null;
  }

  var orig = window.fetch;
  window.fetch = function(url, opts){
    var u = (typeof url === 'string') ? url : (url && url.url) || '';
    if (u.indexOf('/api/') > -1) {
      var method = ((opts && opts.method) || 'GET').toUpperCase();
      var p = pathOnly(u);
      // 改状态：写回内存副本，后续 GET 可见
      if (method === 'PATCH' && p.indexOf('/api/equipment/') > -1) {
        var id = Number(p.split('/').pop());
        var body = {};
        try { body = JSON.parse((opts && opts.body) || '{}'); } catch(e){}
        equipment.forEach(function(e){
          if (e.id === id) Object.keys(body).forEach(function(k){ e[k] = body[k]; });
        });
        return resp({ok: true});
      }
      var data = payload(method, u);
      if (data !== null) return resp(data);
      return resp([]);
    }
    return orig ? orig.apply(window, arguments) : Promise.reject(new Error('no fetch'));
  };
})();
