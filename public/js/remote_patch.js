/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
// Optional hotfix loader.
// If REMOTE_PATCH_URL is set (via Vercel env vars), the app will load a small JS patch
// without requiring a redeploy. Use for emergency bugfixes only.
// Security note: Only point this to a trusted, access-controlled URL.

(function(){
  try{
    const env = (window.EnvRuntime ? EnvRuntime.env() : {});
    const url = (env.REMOTE_PATCH_URL || '').trim();
    if (!url) return;

    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => console.warn('[remote_patch] failed to load');
    document.head.appendChild(s);
  } catch(e) {
    // ignore
  }
})();
