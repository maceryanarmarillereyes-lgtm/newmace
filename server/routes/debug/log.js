export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method_not_allowed' });
    // Allow unauthenticated; this is a debug sink only.
    const body = req.body || {};
    // Avoid logging secrets in full: redact tokens if present
    const redacted = JSON.parse(JSON.stringify(body, (k,v)=>{
      if(typeof v === 'string' && v.length > 80 && /eyJ[a-zA-Z0-9_-]+\./.test(v)) return v.slice(0,20) + '…(redacted jwt)…' + v.slice(-8);
      if(/(anon|service|secret|token|password)/i.test(k) && typeof v === 'string') return v.slice(0,6) + '…(redacted)…';
      return v;
    }));
    console.log('[MUMS_DEBUG]', JSON.stringify(redacted));
    return res.status(200).json({ ok:true });
  } catch (e) {
    console.error('[MUMS_DEBUG] handler error', e);
    return res.status(200).json({ ok:false });
  }
}
