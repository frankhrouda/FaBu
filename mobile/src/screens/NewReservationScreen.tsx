import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { reservationsApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewReservation'>;

export function NewReservationScreen({ route, navigation }: Props) {
  const { token } = useAuth();
  const { vehicleId, vehicleName } = route.params;

  const [date, setDate] = useState('2026-03-23');
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [reason, setReason] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function checkAvailability() {
    if (!token) return;
    try {
      setIsChecking(true);
      setError(null);
      const result = await reservationsApi.checkAvailability(token, {
        vehicleId,
        date,
        timeFrom,
        timeTo,
      });
      setAvailabilityMessage(result.available ? 'Fahrzeug ist verfuegbar.' : 'Fahrzeug ist nicht verfuegbar.');
    } catch (err) {
      setAvailabilityMessage(null);
      setError(err instanceof Error ? err.message : 'Verfuegbarkeit konnte nicht geprueft werden');
    } finally {
      setIsChecking(false);
    }
  }

  async function submitReservation() {
    if (!token) return;
    if (!reason.trim()) {
      setError('Bitte einen Grund eingeben.');
      return;
    }

    if (timeFrom >= timeTo) {
      setError('Endzeit muss nach Startzeit liegen.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await reservationsApi.create(token, {
        vehicleId,
        date,
        timeFrom,
        timeTo,
        reason: reason.trim(),
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reservierung fehlgeschlagen');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Neue Reservierung</Text>
      <Text style={styles.vehicle}>Fahrzeug: {vehicleName} (ID {vehicleId})</Text>

      <Text style={styles.label}>Datum (YYYY-MM-DD)</Text>
      <TextInput value={date} onChangeText={setDate} style={styles.input} />

      <Text style={styles.label}>Von (HH:mm)</Text>
      <TextInput value={timeFrom} onChangeText={setTimeFrom} style={styles.input} />

      <Text style={styles.label}>Bis (HH:mm)</Text>
      <TextInput value={timeTo} onChangeText={setTimeTo} style={styles.input} />

      <Text style={styles.label}>Grund</Text>
      <TextInput value={reason} onChangeText={setReason} style={[styles.input, styles.textarea]} multiline />

      {availabilityMessage ? <Text style={styles.info}>{availabilityMessage}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.secondaryButton} onPress={checkAvailability} disabled={isChecking || isSaving}>
        {isChecking ? <ActivityIndicator color="#145374" /> : <Text style={styles.secondaryText}>Verfuegbarkeit pruefen</Text>}
      </Pressable>

      <Pressable style={styles.primaryButton} onPress={submitReservation} disabled={isChecking || isSaving}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Reservierung speichern</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f6f9',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1d2a34',
    marginBottom: 4,
  },
  vehicle: {
    color: '#475467',
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
    color: '#344054',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#c8d2db',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  info: {
    color: '#145374',
    marginBottom: 10,
    fontWeight: '600',
  },
  error: {
    color: '#b42318',
    marginBottom: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#145374',
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 10,
  },
  secondaryText: {
    color: '#145374',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#145374',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
  },
});
