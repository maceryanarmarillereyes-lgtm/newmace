const CloudTasks = (() => {
  const authHeader = () => {
    const jwt = window.CloudAuth && CloudAuth.accessToken ? CloudAuth.accessToken() : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  };

  const parse = async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: data.message || data.error || `Failed (${res.status})`, data };
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

  const updateItemStatus = async (payload) => parse(await fetch('/api/tasks/item_status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload || {})
  }));

  const workloadMatrix = async (distributionTitle) => {
    const q = distributionTitle ? `?distribution_title=${encodeURIComponent(distributionTitle)}` : '';
    return parse(await fetch(`/api/tasks/workload_matrix${q}`, { headers: { ...authHeader() } }));
  };

  return { assigned, distributions, members, distributionItems, createDistribution, updateItemStatus, workloadMatrix };
})();

window.CloudTasks = CloudTasks;
