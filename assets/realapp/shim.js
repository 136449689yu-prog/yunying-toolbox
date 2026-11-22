/* 静态垫片：让真实清收软件的 workspace.js 脱离后端也能 1:1 运行。
   拦截所有 /api/* 请求，从随包快照返回真实数据。 */
(function(){
  var SNAP = {};
  var files = {
    state: 'state.json',
    gen: 'gen_letters.json',
    lit: 'gen_litigation.json',
    mon: 'gen_monthly.json'
  };
  // 使用内嵌快照（snapshot.js），规避 file:// 下的 XHR 限制
  var D = window.__QS_SNAP__ || {};
  SNAP.state = D.state || {};
  SNAP.gen   = D.gen   || {};
  SNAP.lit   = D.lit   || {};
  SNAP.mon   = D.mon   || {};

  var realFetch = window.fetch.bind(window);
  window.fetch = function(url, options){
    var u = String(url);
    var method = ((options && options.method) || 'GET').toUpperCase();

    // 下载链接：真实软件的文件在 GitHub Release 包里，静态预览无实体文件。
    // 返回一个可用的提示文件，避免 404 报错。
    if (u.indexOf('/api/download/') === 0 || u.indexOf('/api/collection/template') === 0 || u.indexOf('/api/template') === 0) {
      var blob = new Blob(['\u8fd9\u662f\u771f\u5b9e\u6e05\u6536\u5de5\u4f5c\u53f0\u7684\u754c\u9762\u6f14\u793a\u3002\n\u5b8c\u6574\u529f\u80fd\u4e0e\u771f\u5b9e\u6587\u4ef6\u8bf7\u4e0b\u8f7d\u5de5\u4f5c\u53f0\u8f6f\u4ef6\u3002'], {type:'text/plain;charset=utf-8'});
      return Promise.resolve(new Response(blob, {status:200, headers:{'Content-Type':'text/plain;charset=utf-8'}}));
    }

    function jsonResponse(data){
      return Promise.resolve(new Response(JSON.stringify(data), {status:200, headers:{'Content-Type':'application/json'}}));
    }

    if (u.indexOf('/api/workspace/state') > -1) return jsonResponse(SNAP.state);
    if (u.indexOf('/api/settings') > -1) {
      if (method === 'POST') {
        // 保存设置到内存，回显
        try { var body = JSON.parse((options&&options.body)||'{}'); Object.assign(SNAP.state.settings||{}, body); } catch(e){}
        return jsonResponse(SNAP.state.settings || {});
      }
      return jsonResponse(SNAP.state.settings || {});
    }
    if (u.indexOf('/api/collection/load-sample') > -1 || u.indexOf('/api/collection/import') > -1) {
      // 真实后端返回 { state: <collection 对象> }，workspace.js 读 data.state.check_pass
      return jsonResponse({ state: SNAP.state.collection || SNAP.state });
    }
    if (u.indexOf('/api/collection/generate') > -1) {
      // 生成结果写回快照，随后的 loadState() 才不会用旧函件盖掉新结果
      var g = SNAP.gen || {};
      SNAP.state.letter_batch = g.batch;
      SNAP.state.letters = g.letters || [];
      return jsonResponse(g);
    }
    if (u.indexOf('/api/collection/litigation') > -1) {
      var l = SNAP.lit || {};
      SNAP.state.artifacts = SNAP.state.artifacts || {};
      SNAP.state.artifacts.litigation = [{folder:l.folder,name:l.xlsx_name,label:'材料清单汇总（'+(l.records||[]).length+' 户）'}]
        .concat((l.records||[]).map(function(r){return {folder:l.folder,name:r.docx_name,label:r.merchant+' · '+r.level+'优先级'};}));
      return jsonResponse(l);
    }
    if (u.indexOf('/api/collection/monthly') > -1) {
      var m = SNAP.mon || {};
      SNAP.state.artifacts = SNAP.state.artifacts || {};
      SNAP.state.artifacts.monthly = {folder:m.folder,name:m.xlsx_name,summary:m.summary||{}};
      return jsonResponse(m);
    }
    if (u.indexOf('/api/state') > -1) return jsonResponse(SNAP.state);

    // 其他未知 api 走空对象，保证不报错
    if (u.indexOf('/api/') > -1) return jsonResponse({});
    return realFetch(url, options);
  };

  // 拦截设置表单提交（workspace.js 用 form POST），让它静默成功
  document.addEventListener('submit', function(e){
    var f = e.target;
    if (f && f.id === 'settings-form') { e.preventDefault(); }
  }, true);
})();
