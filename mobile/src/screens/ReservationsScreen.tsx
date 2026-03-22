import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { reservationsApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Reservation } from '../types/api';

export function ReservationsScreen() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [selectedCompleteId, setSelectedCompleteId] = useState<number | null>(null);
  const [kmDriven, setKmDriven] = useState('');
  const [destination, setDestination] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Reservation['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!successMessage) return;

    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 2200);

    return () => clearTimeout(timer);
  }, [successMessage]);

  const reservationsQuery = useQuery({
    queryKey: ['reservations'],
    queryFn: () => reservationsApi.list(token as string),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: number) => reservationsApi.cancel(token as string, reservationId),
    onSuccess: async () => {
      setActionError(null);
      setSuccessMessage('Reservierung wurde storniert.');
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (error: Error) => {
      setActionError(error.message);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (input: { reservationId: number; kmDriven: number; destination: string }) =>
      reservationsApi.complete(token as string, input.reservationId, {
        kmDriven: input.kmDriven,
        destination: input.destination,
      }),
    onSuccess: async () => {
      setActionError(null);
      setSuccessMessage('Reservierung wurde abgeschlossen.');
      setSelectedCompleteId(null);
      setKmDriven('');
      setDestination('');
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (error: Error) => {
      setActionError(error.message);
    },
  });

  const sortedData = useMemo(() => {
    const rows = [...(reservationsQuery.data || [])];
    rows.sort((a, b) => `${b.date} ${b.time_from}`.localeCompare(`${a.date} ${a.time_from}`));
    return rows;
  }, [reservationsQuery.data]);

  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortedData.filter((item) => {
      const statusMatches = statusFilter === 'all' || item.status === statusFilter;
      if (!statusMatches) return false;

      if (!query) return true;

      const haystack = [
        item.vehicle_name,
        item.license_plate,
        item.reason,
        item.date,
        item.time_from,
        item.time_to,
        item.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [sortedData, statusFilter, searchQuery]);

  function submitComplete(reservationId: number) {
    setActionError(null);

    const parsedKm = Number(kmDriven);
    if (!Number.isFinite(parsedKm) || parsedKm < 1) {
      setActionError('Bitte gueltige Kilometer > 0 eingeben.');
      return;
    }
    if (!destination.trim()) {
      setActionError('Bitte Zielort eingeben.');
      return;
    }

    completeMutation.mutate({
      reservationId,
      kmDriven: parsedKm,
      destination: destination.trim(),
    });
  }

  function confirmCancel(reservationId: number) {
    Alert.alert('Reservierung stornieren', 'Moechtest du diese Reservierung wirklich stornieren?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Stornieren',
        style: 'destructive',
        onPress: () => cancelMutation.mutate(reservationId),
      },
    ]);
  }

  function renderItem({ item }: { item: Reservation }) {
    const isReserved = item.status === 'reserved';
    const isCompletePanelOpen = selectedCompleteId === item.id;

    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.vehicle_name || item.license_plate || `Fahrzeug ${item.vehicle_id}`}</Text>
        <Text style={styles.meta}>Datum: {item.date}</Text>
        <Text style={styles.meta}>Zeit: {item.time_from} - {item.time_to}</Text>
        <Text style={styles.meta}>Grund: {item.reason}</Text>
        <Text style={[styles.status, statusStyle(item.status)]}>Status: {item.status}</Text>

        {isReserved ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => confirmCancel(item.id)}
              disabled={cancelMutation.isPending || completeMutation.isPending}
            >
              <Text style={styles.actionText}>Stornieren</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.completeButton]}
              onPress={() => {
                setActionError(null);
                setSelectedCompleteId(item.id);
              }}
              disabled={cancelMutation.isPending || completeMutation.isPending}
            >
              <Text style={styles.actionText}>Abschliessen</Text>
            </Pressable>
          </View>
        ) : null}

        {isCompletePanelOpen ? (
          <View style={styles.completePanel}>
            <Text style={styles.panelTitle}>Fahrt abschliessen</Text>
            <TextInput
              value={kmDriven}
              onChangeText={setKmDriven}
              keyboardType="numeric"
              placeholder="Kilometer gefahren"
              style={styles.input}
            />
            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="Zielort"
              style={styles.input}
            />
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => {
                  setSelectedCompleteId(null);
                  setKmDriven('');
                  setDestination('');
                }}
              >
                <Text style={styles.secondaryText}>Abbrechen</Text>
              </Pressable>

              <Pressable
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => submitComplete(item.id)}
                disabled={completeMutation.isPending}
              >
                <Text style={styles.actionText}>Speichern</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  if (reservationsQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (reservationsQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Fehler beim Laden: {(reservationsQuery.error as Error).message}</Text>
        <Pressable style={styles.retryButton} onPress={() => void reservationsQuery.refetch()}>
          <Text style={styles.actionText}>Erneut laden</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {successMessage ? <Text style={styles.successToast}>{successMessage}</Text> : null}
      {!!actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Suche: Fahrzeug, Datum, Grund ..."
        style={styles.searchInput}
      />

      <View style={styles.filterRow}>
        <FilterChip label="Alle" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        <FilterChip
          label="Aktiv"
          active={statusFilter === 'reserved'}
          onPress={() => setStatusFilter('reserved')}
        />
        <FilterChip
          label="Abgeschlossen"
          active={statusFilter === 'completed'}
          onPress={() => setStatusFilter('completed')}
        />
        <FilterChip
          label="Storniert"
          active={statusFilter === 'cancelled'}
          onPress={() => setStatusFilter('cancelled')}
        />
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshing={reservationsQuery.isFetching}
        onRefresh={() => void reservationsQuery.refetch()}
        ListEmptyComponent={<Text style={styles.empty}>Keine Reservierungen gefunden.</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

function statusStyle(status: Reservation['status']) {
  switch (status) {
    case 'reserved':
      return { color: '#145374' };
    case 'completed':
      return { color: '#0e8a4d' };
    case 'cancelled':
      return { color: '#b42318' };
    default:
      return { color: '#344054' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef3f7',
    padding: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#eef3f7',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7e1ea',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#122230',
    marginBottom: 6,
  },
  meta: {
    color: '#475467',
    marginBottom: 2,
  },
  status: {
    marginTop: 6,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#b42318',
  },
  completeButton: {
    backgroundColor: '#145374',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#145374',
    backgroundColor: '#fff',
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryText: {
    color: '#145374',
    fontWeight: '700',
  },
  completePanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#d7e1ea',
  },
  panelTitle: {
    fontWeight: '700',
    color: '#122230',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c8d2db',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#145374',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    color: '#b42318',
    marginBottom: 10,
  },
  successToast: {
    color: '#0e8a4d',
    backgroundColor: '#e9f8ef',
    borderWidth: 1,
    borderColor: '#b4e3c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#c8d2db',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  empty: {
    color: '#475467',
    textAlign: 'center',
    marginTop: 20,
  },
});

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[chipStyles.base, active ? chipStyles.active : chipStyles.inactive]} onPress={onPress}>
      <Text style={[chipStyles.text, active ? chipStyles.textActive : chipStyles.textInactive]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  active: {
    backgroundColor: '#145374',
    borderColor: '#145374',
  },
  inactive: {
    backgroundColor: '#fff',
    borderColor: '#c7d1d9',
  },
  text: {
    fontWeight: '700',
  },
  textActive: {
    color: '#fff',
  },
  textInactive: {
    color: '#344054',
  },
});
