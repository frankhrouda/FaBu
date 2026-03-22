export type RootStackParamList = {
  Login: undefined;
  Vehicles: undefined;
  Reservations: undefined;
  NewReservation: {
    vehicleId: number;
    vehicleName: string;
  };
};
