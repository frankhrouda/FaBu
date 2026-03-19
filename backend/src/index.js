import express from 'express';
import cors from 'cors';
import { getDb } from './db/database.js';
import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import reservationRoutes from './routes/reservations.js';
import userRoutes from './routes/users.js';

getDb(); // Initialize DB on startup

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/users', userRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`\n🚗 FaBu Backend läuft auf http://localhost:${PORT}\n`);
});
