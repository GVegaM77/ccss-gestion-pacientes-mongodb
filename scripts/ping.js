import { conectar, desconectar } from '../src/config/db.js';
const db = await conectar();
const info = await db.admin().serverInfo();
console.log(`Conexión exitosa a "${db.databaseName}" (MongoDB ${info.version})`);
await desconectar();
