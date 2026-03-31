import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { vehiclesApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import type { Vehicle } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Vehicles'>;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3001/api';

function toImageUrl(imagePath?: string | null) {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const serverBase = API_BASE_URL.replace(/\/api\/?$/, '');
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${serverBase}${normalizedPath}`;
}

export function VehiclesScreen({ navigation }: Props) {
  const { token, user, logout, availableTenants, activeTenantId, switchTenant, switchingTenant, isAdmin } = useAuth();

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list(token as string),
    enabled: Boolean(token),
  });

  function renderVehicle({ item }: { item: Vehicle }) {
    const imageUri = toImageUrl(item.image_path);
    const isActive = Boolean(item.active);

    return (
      <View style={styles.card}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.vehicleImage} resizeMode="cover" /> : null}
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardMeta}>{item.license_plate} - {item.type}</Text>
        {!isActive ? <Text style={styles.inactiveBadge}>Inaktiv</Text> : null}
        {!!item.description && <Text style={styles.cardMeta}>{item.description}</Text>}

        <Pressable
          style={[styles.reserveButton, !isActive ? styles.reserveButtonDisabled : null]}
          onPress={() => navigation.navigate('NewReservation', { vehicleId: item.id, vehicleName: item.name })}
          disabled={!isActive}
        >
          <Text style={styles.reserveButtonText}>{isActive ? 'Neu reservieren' : 'Nicht reservierbar'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.heading}>Fahrzeuge</Text>
        <View style={styles.topActions}>
          <Pressable onPress={() => navigation.navigate('Reservations')} style={styles.linkButton}>
            <Text style={styles.linkText}>Reservierungen</Text>
          </Pressable>
          <Pressable onPress={() => void logout()} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.userText}>Angemeldet als: {user?.name}</Text>
      {isAdmin ? <Text style={styles.userMeta}>Rolle: Admin</Text> : null}

      {availableTenants.length > 1 ? (
        <View style={styles.tenantWrap}>
          <Text style={styles.tenantLabel}>Mandant:</Text>
          <View style={styles.tenantRow}>
            {availableTenants.map((tenant) => {
              const active = tenant.id === activeTenantId;
              return (
                <Pressable
                  key={tenant.id}
                  style={[styles.tenantButton, active ? styles.tenantButtonActive : null]}
                  onPress={() => void switchTenant(tenant.id)}
                  disabled={switchingTenant || active}
                >
                  <Text style={[styles.tenantButtonText, active ? styles.tenantButtonTextActive : null]}>{tenant.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {switchingTenant ? <ActivityIndicator size="small" /> : null}
        </View>
      ) : null}

      {vehiclesQuery.isLoading ? (
        <ActivityIndicator />
      ) : vehiclesQuery.isError ? (
        <View>
          <Text style={styles.error}>Fehler beim Laden: {(vehiclesQuery.error as Error).message}</Text>
          <Pressable style={styles.retryButton} onPress={() => void vehiclesQuery.refetch()}>
            <Text style={styles.retryText}>Erneut laden</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={vehiclesQuery.data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderVehicle}
          refreshing={vehiclesQuery.isFetching}
          onRefresh={() => void vehiclesQuery.refetch()}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef3f7',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkButton: {
    backgroundColor: '#145374',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkText: {
    color: '#fff',
    fontWeight: '600',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1d2a34',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#c7d1d9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logoutText: {
    color: '#1d2a34',
    fontWeight: '600',
  },
  userText: {
    color: '#475467',
    marginBottom: 6,
  },
  userMeta: {
    color: '#6b7280',
    marginBottom: 12,
    fontSize: 12,
  },
  tenantWrap: {
    marginBottom: 12,
    gap: 8,
  },
  tenantLabel: {
    color: '#475467',
    fontWeight: '600',
  },
  tenantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tenantButton: {
    borderWidth: 1,
    borderColor: '#c7d1d9',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tenantButtonActive: {
    backgroundColor: '#145374',
    borderColor: '#145374',
  },
  tenantButtonText: {
    color: '#1d2a34',
    fontSize: 12,
    fontWeight: '600',
  },
  tenantButtonTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d9e2ea',
  },
  vehicleImage: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#dde7ef',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#122230',
  },
  cardMeta: {
    marginTop: 4,
    color: '#475467',
  },
  inactiveBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#f2f4f7',
    color: '#475467',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  reserveButton: {
    marginTop: 10,
    backgroundColor: '#145374',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reserveButtonDisabled: {
    backgroundColor: '#98a2b3',
  },
  reserveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#b42318',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#145374',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
