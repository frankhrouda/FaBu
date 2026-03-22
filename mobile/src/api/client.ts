import type { AuthResponse, Reservation, Vehicle } from '../types/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3001/api';

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function mapStatusMessage(status: number) {
  switch (status) {
    case 400:
      return 'Ungueltige Eingabe. Bitte Daten pruefen.';
    case 401:
      return 'Sitzung abgelaufen. Bitte neu einloggen.';
    case 403:
      return 'Keine Berechtigung fuer diese Aktion.';
    case 404:
      return 'Der Eintrag wurde nicht gefunden.';
    case 409:
      return 'Konflikt mit vorhandenen Daten. Bitte pruefen.';
    case 429:
      return 'Zu viele Anfragen. Bitte kurz warten.';
    case 500:
      return 'Serverfehler. Bitte spaeter erneut versuchen.';
    default:
      return `HTTP ${status}`;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error || mapStatusMessage(response.status);

    // Only trigger global unauthorized handling for authenticated requests.
    if (response.status === 401 && token && unauthorizedHandler) {
      await unauthorizedHandler();
    }

    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const authApi = {
  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
};

export const vehiclesApi = {
  list(token: string) {
    return request<Vehicle[]>('/vehicles', { method: 'GET' }, token);
  },
};

export const reservationsApi = {
  list(token: string) {
    return request<Reservation[]>('/reservations', { method: 'GET' }, token);
  },

  checkAvailability(token: string, input: { vehicleId: number; date: string; timeFrom: string; timeTo: string }) {
    const params = new URLSearchParams({
      vehicle_id: String(input.vehicleId),
      date: input.date,
      time_from: input.timeFrom,
      time_to: input.timeTo,
    });

    return request<{ available: boolean }>(`/reservations/availability?${params.toString()}`, { method: 'GET' }, token);
  },

  create(
    token: string,
    input: { vehicleId: number; date: string; timeFrom: string; timeTo: string; reason: string }
  ) {
    return request<Reservation>(
      '/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: input.vehicleId,
          date: input.date,
          time_from: input.timeFrom,
          time_to: input.timeTo,
          reason: input.reason,
        }),
      },
      token
    );
  },

  cancel(token: string, reservationId: number) {
    return request<{ success: boolean }>(`/reservations/${reservationId}/cancel`, { method: 'PATCH' }, token);
  },

  complete(token: string, reservationId: number, input: { kmDriven: number; destination: string }) {
    return request<Reservation>(
      `/reservations/${reservationId}/complete`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          km_driven: input.kmDriven,
          destination: input.destination,
        }),
      },
      token
    );
  },
};
