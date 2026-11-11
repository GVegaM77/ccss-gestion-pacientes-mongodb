// Crea las colecciones con su validador $jsonSchema y sus índices. Es idempotente (se puede repetir).
import { conectar, desconectar } from '../src/config/db.js';
import { colecciones } from './schemas.js';

const db = await conectar();
const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

for (const [nombre, def] of Object.entries(colecciones)) {
  const validator = { $jsonSchema: def.validator };
  if (!existentes.has(nombre)) {
    await db.createCollection(nombre, { validator, validationLevel: 'strict', validationAction: 'error' });
    console.log(`+ colección creada: ${nombre}`);
  } else {
    await db.command({ collMod: nombre, validator, validationLevel: 'strict', validationAction: 'error' });
    console.log(`~ validador actualizado: ${nombre}`);
  }
  for (const ix of def.indices) await db.collection(nombre).createIndex(ix.key, ix.options);
  console.log(`  índices: ${def.indices.map((i) => i.options.name).join(', ')}`);
}
await desconectar();
