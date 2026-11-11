// CURSORES. En MongoDB find() y aggregate() devuelven un cursor: un puntero que trae los
// resultados del servidor por lotes (batchSize) en lugar de cargar todo en memoria.
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { once } from 'node:events';
import { conectar } from '../config/db.js';
import { aObjectId } from '../utils/ids.js';
import { calcularEdad } from '../funciones/index.js';

/**
 * 1) Recorrido por lotes con "for await": procesa N pacientes sin cargarlos todos en memoria.
 * ENTRADAS: tamanoLote, procesar(paciente) ; SALIDA: cantidad de documentos procesados.
 */
export async function recorrerPacientes(tamanoLote, procesar) {
  const cursor = (await conectar()).collection('pacientes')
    .find({ activo: true }, { projection: { nombre: 1, apellidos: 1, fecha_nacimiento: 1, alergias: 1 } })
    .sort({ apellidos: 1 }).batchSize(tamanoLote);
  let n = 0;
  try {
    for await (const paciente of cursor) { await procesar(paciente); n++; }
  } finally {
    await cursor.close();
  }
  return n;
}

/**
 * 2) Uso explícito del cursor (hasNext / next): obtiene los primeros "limite" pacientes con alergias
 *    y calcula su edad. Muestra el ciclo de vida del cursor: abrir, avanzar, cerrar.
 */
export async function pacientesConAlergias(limite = 5) {
  const cursor = (await conectar()).collection('pacientes').find({ 'alergias.0': { $exists: true } }).limit(limite);
  const salida = [];
  try {
    while (await cursor.hasNext()) {
      const p = await cursor.next();
      salida.push({ cedula: p.cedula, nombre: `${p.nombre} ${p.apellidos}`, edad: calcularEdad(p.fecha_nacimiento), alergias: p.alergias });
    }
  } finally {
    await cursor.close();
  }
  return salida;
}

/**
 * 3) Paginación por cursor (keyset): más eficiente que skip() en colecciones grandes.
 * ENTRADAS: pacienteId, tamano, desdeId (el último _id de la página anterior, o null)
 * SALIDA: { datos, siguiente } donde "siguiente" es el _id para pedir la próxima página (null si no hay más).
 */
export async function paginarConsultas(pacienteId, tamano = 5, desdeId = null) {
  const filtro = { paciente_id: aObjectId(pacienteId) };
  if (desdeId) filtro._id = { $gt: aObjectId(desdeId, 'desdeId') };
  const datos = await (await conectar()).collection('consultas').find(filtro).sort({ _id: 1 }).limit(tamano + 1).toArray();
  const hayMas = datos.length > tamano;
  if (hayMas) datos.pop();
  return { datos, siguiente: hayMas ? datos[datos.length - 1]._id : null };
}

/**
 * 4) Exportación a CSV con cursor de agregación: memoria constante aunque haya millones de filas.
 *    Registra la exportación en la bitácora (acción "exportacion").
 * ENTRADAS: rutaArchivo, { desde, hasta } (fechas), { usuarioId, ip }
 * SALIDA: { filas, ruta }
 */
export async function exportarConsultasCSV(rutaArchivo, { desde = new Date(0), hasta = new Date() } = {}, { usuarioId, ip } = {}) {
  const db = await conectar();
  await mkdir(dirname(rutaArchivo), { recursive: true });
  const salida = createWriteStream(rutaArchivo, { encoding: 'utf8' });
  const esc = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
  salida.write('fecha,paciente_id,centro,profesional,motivo,diagnosticos\n');

  const cursor = db.collection('v_historial_paciente').aggregate(
    [{ $match: { fecha: { $gte: desde, $lte: hasta } } }, { $sort: { fecha: 1 } }],
    { batchSize: 500, allowDiskUse: true }
  );
  let filas = 0;
  try {
    for await (const c of cursor) {
      const linea = [c.fecha.toISOString(), c.paciente_id, c.centro, c.profesional, c.motivo, (c.diagnosticos || []).map((d) => d.cie10).join('|')].map(esc).join(',') + '\n';
      if (!salida.write(linea)) await once(salida, 'drain'); // respeta la contrapresión del archivo
      filas++;
    }
  } finally {
    await cursor.close();
    salida.end();
    await once(salida, 'finish');
  }
  if (usuarioId) {
    await db.collection('bitacora_accesos').insertOne({ usuario_id: aObjectId(usuarioId, 'usuarioId'), paciente_id: (await db.collection('pacientes').findOne({}, { projection: { _id: 1 } }))._id, accion: 'exportacion', fecha: new Date(), ip });
  }
  return { filas, ruta: rutaArchivo };
}

/**
 * 5) Change Stream: cursor "vivo" que recibe cada cambio de una colección (requiere replica set).
 *    Útil para alertas, por ejemplo cuando se inserta un resultado de laboratorio.
 * ENTRADAS: nombreColeccion, alRecibir(evento) ; SALIDA: función "detener()".
 */
export async function vigilarColeccion(nombreColeccion, alRecibir) {
  const flujo = (await conectar()).collection(nombreColeccion).watch([], { fullDocument: 'updateLookup' });
  await flujo.tryNext();            // abre realmente el cursor en el servidor antes de devolver el control
  (async () => { try { for await (const evento of flujo) alRecibir(evento); } catch { /* flujo cerrado */ } })();
  return async () => { await flujo.close(); };
}
