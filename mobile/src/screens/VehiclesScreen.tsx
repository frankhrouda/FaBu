import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { vehiclesApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import type { Vehicle } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Vehicles'>;

export function VehiclesScreen({ navigation }: Props) {
  const { token, user, logout } = useAuth();

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list(token as string),
    enabled: Boolean(token),
  });

  function renderVehicle({ item }: { item: Vehicle }) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardMeta}>{item.license_plate} - {item.type}</Text>
        {!!item.description && <Text style={styles.cardMeta}>{item.description}</Text>}

        <Pressable
          style={styles.reserveButton}
          onPress={() => navigation.navigate('NewReservation', { vehicleId: item.id, vehicleName: item.name })}
        >
          <Text style={styles.reserveButtonText}>Neu reservieren</Text>
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
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d9e2ea',
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
  reserveButton: {
    marginTop: 10,
    backgroundColor: '#145374',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
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
