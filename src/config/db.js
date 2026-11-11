// Conexión a MongoDB (patrón singleton) con el driver oficial.
// Seguridad: las credenciales vienen de variables de entorno, nunca del código.
import 'dotenv/config';
import { MongoClient, ServerApiVersion } from 'mongodb';

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'ccss_pacientes';

if (!URI) {
  throw new Error('Falta MONGODB_URI. Copie .env.example a .env y complete los valores.');
}

let client = null;
let db = null;

/** Abre la conexión (una sola vez) y devuelve el objeto Db. */
export async function conectar() {
  if (db) return db;

  client = new MongoClient(URI, {
    serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
    tls: process.env.MONGODB_TLS === 'true',          // cifrado en tránsito
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL || 20),
    serverSelectionTimeoutMS: 5000,                    // falla rápido si no hay servidor
    retryWrites: true,
    ignoreUndefined: true,                             // los campos opcionales sin valor no se guardan como null
    appName: 'ccss-gestion-pacientes',
    writeConcern: { w: 'majority' },                   // durabilidad en el replica set
    readConcern: { level: 'majority' }
  });

  await client.connect();
  db = client.db(DB_NAME);
  await db.command({ ping: 1 });                       // verifica que la conexión funciona
  return db;
}

/** Devuelve el cliente (necesario para abrir sesiones/transacciones). */
export function obtenerCliente() {
  if (!client) throw new Error('Primero llame a conectar().');
  return client;
}

/** Cierra la conexión de forma ordenada. */
export async function desconectar() {
  if (client) await client.close();
  client = null;
  db = null;
}

// Cierre limpio al terminar el proceso
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, async () => { await desconectar(); process.exit(0); });
}
