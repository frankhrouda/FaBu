import * as SecureStore from 'expo-secure-store';
import type { User } from '../types/api';
import type { TenantMembership } from '../types/api';

const TOKEN_KEY = 'fabu_token';
const USER_KEY = 'fabu_user';
const TENANTS_KEY = 'fabu_tenants';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string) {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User) {
  return SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredTenants(): Promise<TenantMembership[]> {
  const raw = await SecureStore.getItemAsync(TENANTS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as TenantMembership[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setStoredTenants(tenants: TenantMembership[]) {
  return SecureStore.setItemAsync(TENANTS_KEY, JSON.stringify(tenants));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(TENANTS_KEY);
}
