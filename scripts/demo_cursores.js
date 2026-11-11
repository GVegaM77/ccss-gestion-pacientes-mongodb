import { conectar, desconectar } from '../src/config/db.js';
import * as cur from '../src/cursores/index.js';

let suma = 0;
const n = await cur.recorrerPacientes(50, async (p) => { suma += p.alergias?.length ?? 0; });
console.log(`1) recorrerPacientes: ${n} pacientes procesados en lotes de 50 (${suma} alergias en total)`);

console.log('2) pacientesConAlergias(3):'); console.table(await cur.pacientesConAlergias(3));

const db = await conectar();
const { _id: pid } = (await db.collection('consultas').aggregate([{ $group: { _id: '$paciente_id', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0];
let pag = await cur.paginarConsultas(pid, 3), num = 1;
console.log(`3) paginarConsultas: página ${num} -> ${pag.datos.length} consultas`);
while (pag.siguiente) { pag = await cur.paginarConsultas(pid, 3, pag.siguiente); console.log(`   página ${++num} -> ${pag.datos.length} consultas`); }

const u = await db.collection('usuarios').findOne({ rol: 'analista' });
console.log('4) exportarConsultasCSV:', await cur.exportarConsultasCSV('exports/consultas.csv', {}, { usuarioId: u._id, ip: '10.0.0.5' }));

const eventos = [];
const detener = await cur.vigilarColeccion('examenes_laboratorio', (e) => eventos.push(e.operationType));
const ex = await db.collection('examenes_laboratorio').findOne({});
await db.collection('examenes_laboratorio').updateOne({ _id: ex._id }, { $set: { revisado_en: new Date() } });
await new Promise((r) => setTimeout(r, 800));
await detener();
console.log('5) vigilarColeccion (change stream): eventos recibidos ->', eventos.join(', ') || 'ninguno');
await desconectar();
