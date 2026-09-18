import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;

try {
  const app = await createApp();

  const server = app.listen(PORT, () => {
    console.log(`\n🚗 FaBu Backend läuft auf http://localhost:${PORT}\n`);
  });

  // Graceful Shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM Signal empfangen: Fahre Server herunter...');
    server.close(() => {
      console.log('Server beendet');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT Signal empfangen: Fahre Server herunter...');
    server.close(() => {
      console.log('Server beendet');
      process.exit(0);
    });
  });
} catch (error) {
  console.error('❌ KRITISCHER FEHLER beim Starten des Servers:');
  console.error(error.message);
  
  // Bessere Fehlerdiagnose
  if (error.code === '08006' || error.message?.includes('PostgreSQL')) {
    console.error('\n📋 Diagnose: PostgreSQL ist nicht erreichbar');
    console.error('   - Ist PostgreSQL gestartet? (sudo systemctl status postgresql)');
    console.error('   - Stimmen die DATABASE_URL Einstellungen in .env?');
    console.error('   - DATABASE_URL:', process.env.DATABASE_URL);
  } else if (error.message?.includes('SQLite')) {
    console.error('\n📋 Diagnose: SQLite Fehler');
    console.error('   - Ist das data/ Verzeichnis beschreibbar?');
    console.error('   - Fehler:', error.originalError?.message);
  }
  
  process.exit(1);
}
