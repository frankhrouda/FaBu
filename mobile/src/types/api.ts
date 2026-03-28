export type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  super_admin?: boolean;
  active_tenant_id?: number | null;
  tenant_role?: 'admin' | 'user' | null;
  is_admin?: boolean;
};

export type TenantMembership = {
  id: number;
  name: string;
  role: 'admin' | 'user';
};

export type AuthResponse = {
  token: string;
  user: User;
  available_tenants?: TenantMembership[];
};

export type Vehicle = {
  id: number;
  name: string;
  license_plate: string;
  type: string;
  description: string;
  active: number;
  created_at?: string;
};

export type Reservation = {
  id: number;
  user_id: number;
  vehicle_id: number;
  date: string;
  time_from: string;
  time_to: string;
  reason: string;
  km_driven: number | null;
  destination: string | null;
  status: 'reserved' | 'completed' | 'cancelled';
  created_at?: string;
  user_name?: string;
  user_email?: string;
  vehicle_name?: string;
  license_plate?: string;
};
