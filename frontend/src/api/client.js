const BASE = '/api';

export const SESSION_TIMEOUT_MESSAGE = 'Sie wurden wegen zu langer Inaktivität abgemeldet. Bitte melden Sie sich neu an.';
export const SESSION_NOTICE_STORAGE_KEY = 'fabu_session_notice';

function notifySessionExpired() {
  localStorage.setItem(SESSION_NOTICE_STORAGE_KEY, SESSION_TIMEOUT_MESSAGE);
  window.dispatchEvent(new CustomEvent('fabu:session-expired', {
    detail: { message: SESSION_TIMEOUT_MESSAGE },
  }));
}

async function request(path, options = {}) {
  const token = localStorage.getItem('fabu_token');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (!res.ok) {
    if (res.status === 401 && token) {
      notifySessionExpired();
      const err = new Error(SESSION_TIMEOUT_MESSAGE);
      err.code = 'SESSION_EXPIRED';
      throw err;
    }

    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  uploadVehicleImage: (vehicleId, file) => {
    const body = new FormData();
    body.append('image', file);
    return request(`/vehicles/${vehicleId}/image`, { method: 'POST', body });
  },
};
