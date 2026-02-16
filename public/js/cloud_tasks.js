const CloudTasks = (() => {
  const authHeader = () => {
    const jwt = window.CloudAuth && CloudAuth.accessToken ? CloudAuth.accessToken() : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  };

  const parse = async (res) => {
    const contentType = String(res.headers.get('content-type') || '');
    let data = {};

    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      const raw = await res.text().catch(() => '');
      data = { message: raw ? raw.slice(0, 240) : '' };
    }

    if (!res.ok) {
      const base = data.message || data.error || `Failed (${res.status})`;
      const details = data.details || data.hint || data.error_description || '';
      const detailsText = typeof details === 'string' ? details : JSON.stringify(details || '');
      const message = detailsText && detailsText !== base ? `${base}: ${detailsText}` : base;
      return { ok: false, status: res.status, message, data };
    }

    return { ok: true, data };
  };

  const assigned = async () => parse(await fetch('/api/tasks/assigned', { headers: { ...authHeader() } }));
  const distributions = async () => parse(await fetch('/api/tasks/distributions', { headers: { ...authHeader() } }));
  const members = async () => parse(await fetch('/api/tasks/members', { headers: { ...authHeader() } }));

  const distributionItems = async (distributionId) => parse(await fetch(`/api/tasks/distribution_items?distribution_id=${encodeURIComponent(String(distributionId || ''))}`, { headers: { ...authHeader() } }));

  const createDistribution = async (payload) => parse(await fetch('/api/tasks/distributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload || {})
  }));

  const deleteDistribution = async (distributionId) => parse(await fetch(`/api/tasks/distributions?distribution_id=${encodeURIComponent(String(distributionId || ''))}`, {
    method: 'DELETE',
    headers: { ...authHeader() }
  }));

  const updateItemStatus = async (payload) => parse(await fetch('/api/tasks/item_status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload || {})
  }));

  const workloadMatrix = async (distributionTitle) => {
    const q = distributionTitle ? `?distribution_title=${encodeURIComponent(distributionTitle)}` : '';
    return parse(await fetch(`/api/tasks/workload_matrix${q}`, { headers: { ...authHeader() } }));
  };

  return { assigned, distributions, members, distributionItems, createDistribution, deleteDistribution, updateItemStatus, workloadMatrix };
})();

window.CloudTasks = CloudTasks;
