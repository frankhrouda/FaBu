import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;

const app = await createApp();

app.listen(PORT, () => {
  console.log(`\n🚗 FaBu Backend läuft auf http://localhost:${PORT}\n`);
});
