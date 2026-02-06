export async function onRequest(context) {
  const env = context.env || {};
  const body = {
    SUPABASE_URL: String(env.SUPABASE_URL || ''),
    SUPABASE_ANON_KEY: String(env.SUPABASE_ANON_KEY || ''),
    USERNAME_EMAIL_DOMAIN: String(env.USERNAME_EMAIL_DOMAIN || 'mums.local'),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
