import { conectar, desconectar } from '../src/config/db.js';
import { vistas } from '../database/vistas.js';

const db = await conectar();
for (const v of vistas) {
  console.log(`\n--- ${v.nombre}: ${v.descripcion}`);
  console.log(JSON.stringify(await db.collection(v.nombre).find({}, { limit: 2 }).toArray(), null, 1).slice(0, 700));
}
await desconectar();
