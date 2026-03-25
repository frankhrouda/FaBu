import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/client.js';
import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import reservationRoutes from './routes/reservations.js';
import userRoutes from './routes/users.js';

await initDb(); // Initialize DB on startup

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Authentifizierungsversuche. Bitte spaeter erneut versuchen.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' },
});

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', 'https://fabu-online.de', 'https://www.fabu-online.de'] }));
app.use(helmet());
app.use(express.json());

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

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
