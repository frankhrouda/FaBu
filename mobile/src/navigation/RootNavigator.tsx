import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { NewReservationScreen } from '../screens/NewReservationScreen';
import { ReservationsScreen } from '../screens/ReservationsScreen';
import { VehiclesScreen } from '../screens/VehiclesScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { token, isReady } = useAuth();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Vehicles" component={VehiclesScreen} options={{ title: 'FaBu Fahrzeuge' }} />
      <Stack.Screen name="Reservations" component={ReservationsScreen} options={{ title: 'Meine Reservierungen' }} />
      <Stack.Screen name="NewReservation" component={NewReservationScreen} options={{ title: 'Reservierung' }} />
    </Stack.Navigator>
  );
}
