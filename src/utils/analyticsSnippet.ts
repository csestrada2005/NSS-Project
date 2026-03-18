/**
 * Generates a self-contained analytics tracking snippet suitable
 * for injection into a deployed project's index.html.
 */
export function generateAnalyticsSnippet(projectId: string, collectorUrl: string): string {
  const snippet = `(function(){
  var _pid=${JSON.stringify(projectId)};
  var _url=${JSON.stringify(collectorUrl)};
  var _sid=sessionStorage.getItem('_fsid')||(function(){var id=Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem('_fsid',id);return id;})();
  var _pvCount=0;
  var _startTime=Date.now();
  function _track(event,extra){
    var body=Object.assign({project_id:_pid,session_id:_sid,event:event,path:location.pathname},extra||{});
    if(navigator.sendBeacon){navigator.sendBeacon(_url,JSON.stringify(body));}
    else{fetch(_url,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},keepalive:true});}
  }
  function _pageview(){_pvCount++;_track('pageview',{referrer:document.referrer||''});}
  document.addEventListener('DOMContentLoaded',_pageview);
  window.addEventListener('popstate',_pageview);
  window.addEventListener('hashchange',_pageview);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){
      var dur=Math.round((Date.now()-_startTime)/1000);
      _track('session_end',{duration_seconds:dur,is_bounce:_pvCount<=1});
    }
  });
})();`;

  return `<!-- forge-analytics -->\n<script>${snippet}</script>`;
}
