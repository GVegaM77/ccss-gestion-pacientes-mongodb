// PROCEDIMIENTOS ALMACENADOS
// MongoDB no tiene PL/SQL. Los procedimientos se implementan como funciones de la capa de datos que
// agrupan varias operaciones en UNA transacción multi-documento (ACID, requiere replica set):
// o se guardan todos los cambios o no se guarda ninguno. Cada procedimiento documenta
// sus ENTRADAS (parámetros) y SALIDAS (valor devuelto / errores).
import { conectar, obtenerCliente } from '../config/db.js';
import { aObjectId, normalizar } from '../utils/ids.js';
import { hashPassword } from '../utils/seguridad.js';

const OPCIONES_TX = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' };

async function enTransaccion(trabajo) {
  const sesion = obtenerCliente().startSession();
  try {
    let resultado;
    await sesion.withTransaction(async () => { resultado = await trabajo(sesion); }, OPCIONES_TX);
    return resultado;
  } finally {
    await sesion.endSession();
  }
}

/**
 * sp_registrar_consulta
 * ENTRADAS: { consulta, prescripcion?, examenes? } + { usuarioId, ip }
 *   consulta: { paciente_id, profesional_id, centro_id, motivo, signos_vitales?, diagnosticos?, comentarios_medico? }
 *   prescripcion: { medicamentos: [{ nombre, dosis, frecuencia, dias }] }
 *   examenes: [{ tipo, resultados: [...] }]
 * REGLAS: el paciente debe existir y estar activo; ningún medicamento puede coincidir con una alergia registrada.
 * SALIDA: { consulta_id, prescripcion_id|null, examenes_ids[] }
 * ERRORES: paciente inexistente/inactivo, alergia detectada. En ese caso no se guarda nada (rollback).
 */
export async function registrarConsulta({ consulta, prescripcion = null, examenes = [] }, { usuarioId, ip }) {
  const db = await conectar();
  const c = normalizar(consulta);
  const ahora = new Date();

  return enTransaccion(async (sesion) => {
    const paciente = await db.collection('pacientes').findOne({ _id: c.paciente_id }, { session: sesion });
    if (!paciente || !paciente.activo) throw new Error('El paciente no existe o está inactivo.');

    if (prescripcion) {
      const alergias = (paciente.alergias || []).map((a) => a.toLowerCase());
      const conflicto = prescripcion.medicamentos.find((m) => alergias.some((a) => m.nombre.toLowerCase().includes(a)));
      if (conflicto) throw new Error(`Alergia detectada: el paciente es alérgico a "${conflicto.nombre}".`);
    }

    const { insertedId: consultaId } = await db.collection('consultas').insertOne({ ...c, fecha: c.fecha ?? ahora }, { session: sesion });

    let prescripcionId = null;
    if (prescripcion) {
      const r = await db.collection('prescripciones').insertOne({
        consulta_id: consultaId, paciente_id: c.paciente_id, profesional_id: c.profesional_id,
        fecha: ahora, estado: 'activa', medicamentos: prescripcion.medicamentos
      }, { session: sesion });
      prescripcionId = r.insertedId;
    }

    let examenesIds = [];
    if (examenes.length) {
      const r = await db.collection('examenes_laboratorio').insertMany(
        examenes.map((e) => ({ ...normalizar(e), paciente_id: c.paciente_id, consulta_id: consultaId, fecha: ahora })),
        { session: sesion }
      );
      examenesIds = Object.values(r.insertedIds);
    }

    await db.collection('bitacora_accesos').insertOne(
      { usuario_id: aObjectId(usuarioId, 'usuarioId'), paciente_id: c.paciente_id, accion: 'escritura', fecha: ahora, ip },
      { session: sesion }
    );
    return { consulta_id: consultaId, prescripcion_id: prescripcionId, examenes_ids: examenesIds };
  });
}

/**
 * sp_consultar_expediente
 * ENTRADAS: pacienteId, { usuarioId, ip }
 * SALIDA: expediente completo { paciente, consultas[], prescripciones_activas[], examenes[], imagenes[], cirugias[] }
 * EFECTO: registra la lectura en bitacora_accesos (trazabilidad exigida por la Ley 8968).
 */
export async function consultarExpediente(pacienteId, { usuarioId, ip }) {
  const db = await conectar();
  const id = aObjectId(pacienteId, 'pacienteId');
  const paciente = await db.collection('pacientes').findOne({ _id: id });
  if (!paciente) throw new Error('Paciente no encontrado.');

  const porFecha = { fecha: -1 };
  const [consultas, prescripciones, examenes, imagenes, cirugias] = await Promise.all([
    db.collection('consultas').find({ paciente_id: id }).sort(porFecha).toArray(),
    db.collection('prescripciones').find({ paciente_id: id, estado: 'activa' }).sort(porFecha).toArray(),
    db.collection('examenes_laboratorio').find({ paciente_id: id }).sort(porFecha).toArray(),
    db.collection('imagenes_medicas').find({ paciente_id: id }).sort(porFecha).toArray(),
    db.collection('cirugias').find({ paciente_id: id }).sort(porFecha).toArray()
  ]);

  await db.collection('bitacora_accesos').insertOne({ usuario_id: aObjectId(usuarioId, 'usuarioId'), paciente_id: id, accion: 'lectura', fecha: new Date(), ip });
  return { paciente, consultas, prescripciones_activas: prescripciones, examenes, imagenes, cirugias };
}

/**
 * sp_registrar_cirugia_realizada
 * ENTRADAS: cirugiaId, etapas [{ etapa, hora }], { usuarioId, ip }
 * REGLAS: la cirugía debe estar "programada" (no se puede cerrar dos veces).
 * SALIDA: documento de la cirugía actualizado (estado "realizada" y ruta quirúrgica completa).
 */
export async function registrarCirugiaRealizada(cirugiaId, etapas, { usuarioId, ip }) {
  const db = await conectar();
  return enTransaccion(async (sesion) => {
    const cir = await db.collection('cirugias').findOneAndUpdate(
      { _id: aObjectId(cirugiaId, 'cirugiaId'), estado: 'programada' },
      { $set: { estado: 'realizada' }, $push: { ruta_quirurgica: { $each: normalizar(etapas) } } },
      { returnDocument: 'after', session: sesion }
    );
    if (!cir) throw new Error('La cirugía no existe o ya fue registrada como realizada.');
    await db.collection('bitacora_accesos').insertOne(
      { usuario_id: aObjectId(usuarioId, 'usuarioId'), paciente_id: cir.paciente_id, accion: 'escritura', fecha: new Date(), ip },
      { session: sesion }
    );
    return cir;
  });
}

/**
 * sp_crear_usuario_profesional
 * ENTRADAS: { profesional_id, username, password, rol }
 * REGLAS: el profesional debe existir; un profesional solo puede tener un usuario (índice único).
 * SALIDA: { _id, username, rol, centro_id } (nunca devuelve el hash).
 */
export async function crearUsuarioProfesional({ profesional_id, username, password, rol }) {
  const db = await conectar();
  const prof = await db.collection('profesionales').findOne({ _id: aObjectId(profesional_id, 'profesional_id') });
  if (!prof) throw new Error('El profesional no existe.');
  const doc = { username, password_hash: hashPassword(password), rol, profesional_id: prof._id, centro_id: prof.centro_id, activo: true };
  const { insertedId } = await db.collection('usuarios').insertOne(doc);
  return { _id: insertedId, username, rol, centro_id: prof.centro_id };
}

/**
 * sp_desactivar_paciente (borrado lógico)
 * ENTRADAS: pacienteId, { usuarioId, ip }
 * EFECTO: activo=false y registro en bitácora, en una sola transacción.
 * SALIDA: true si se desactivó.
 */
export async function desactivarPaciente(pacienteId, { usuarioId, ip }) {
  const db = await conectar();
  const id = aObjectId(pacienteId, 'pacienteId');
  return enTransaccion(async (sesion) => {
    const r = await db.collection('pacientes').updateOne({ _id: id, activo: true }, { $set: { activo: false } }, { session: sesion });
    if (r.modifiedCount !== 1) throw new Error('El paciente no existe o ya estaba inactivo.');
    await db.collection('bitacora_accesos').insertOne(
      { usuario_id: aObjectId(usuarioId, 'usuarioId'), paciente_id: id, accion: 'escritura', fecha: new Date(), ip },
      { session: sesion }
    );
    return true;
  });
}

/**
 * sp_finalizar_prescripciones_vencidas (proceso por lotes)
 * ENTRADAS: fechaCorte (Date, por defecto ahora)
 * REGLA: una prescripción activa vence cuando fecha + (máximo de días de sus medicamentos) <= fechaCorte.
 * SALIDA: { revisadas, finalizadas }
 */
export async function finalizarPrescripcionesVencidas(fechaCorte = new Date()) {
  const col = (await conectar()).collection('prescripciones');
  const r = await col.updateMany(
    { estado: 'activa', $expr: { $lte: [{ $dateAdd: { startDate: '$fecha', unit: 'day', amount: { $max: '$medicamentos.dias' } } }, fechaCorte] } },
    { $set: { estado: 'finalizada' } }
  );
  return { revisadas: r.matchedCount, finalizadas: r.modifiedCount };
}
