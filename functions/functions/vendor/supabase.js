// Cloudflare Pages Function: serve Supabase UMD bundle as a first-party script.
//
// Route: /functions/vendor/supabase.js
//
// NOTE:
// - This is intentionally duplicated (vs /api/vendor/...) to support the
//   project's dual-platform architecture:
//     - Vercel UAT uses /api
//     - Cloudflare PROD uses /functions
// - Loading from first-party origin avoids Edge Tracking Prevention warnings.

const SUPABASE_VERSION = '2.49.0';
const SUPABASE_UMD_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_VERSION}/dist/umd/supabase.min.js`;

export async function onRequest() {
  try {
    const r = await fetch(SUPABASE_UMD_URL, {
      headers: { 'Accept': 'application/javascript,text/javascript,*/*;q=0.9' }
    });
    const text = await r.text();

    if (!r.ok || !text) {
      return new Response(`console.warn('[MUMS] Failed to load Supabase SDK (proxy). Status: ${r.status}');\n`, {
        status: 502,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=60, s-maxage=60',
          'x-mums-vendor': 'supabase',
          'x-mums-upstream-status': String(r.status || '')
        }
      });
    }

    // Long cache: version is pinned.
    const headers = {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
      'x-mums-vendor': 'supabase',
      'x-mums-vendor-version': SUPABASE_VERSION
    };

    try {
      const etag = r.headers.get('etag');
      if (etag) headers.etag = etag;
    } catch (_) {}

    return new Response(text, { status: 200, headers });
  } catch (err) {
    return new Response(
      `console.warn('[MUMS] Supabase SDK proxy exception: ${String(err && (err.message || err) || 'unknown')}');\n`,
      {
        status: 502,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=60, s-maxage=60',
          'x-mums-vendor': 'supabase',
          'x-mums-upstream-status': 'exception'
        }
      }
    );
  }
}
