// VISTAS: vistas de solo lectura (db.createView) definidas sobre pipelines de agregación.
// No almacenan datos: se recalculan al consultarlas. Es idempotente (borra y recrea).
import { conectar, desconectar } from '../src/config/db.js';

export const vistas = [
  {
    nombre: 'v_historial_paciente',
    base: 'consultas',
    descripcion: 'Historial de consultas con el nombre del profesional y del centro (ya resueltas las referencias).',
    pipeline: [
      { $lookup: { from: 'profesionales', localField: 'profesional_id', foreignField: '_id', as: 'prof' } },
      { $lookup: { from: 'centros_salud', localField: 'centro_id', foreignField: '_id', as: 'centro' } },
      { $project: {
          paciente_id: 1, fecha: 1, motivo: 1, diagnosticos: 1, signos_vitales: 1,
          profesional: { $first: '$prof.nombre' }, especialidad: { $first: '$prof.especialidad' }, centro: { $first: '$centro.nombre' }
      } },
      { $sort: { fecha: -1 } }
    ]
  },
  {
    nombre: 'v_expediente_resumen',
    base: 'pacientes',
    descripcion: 'Resumen por paciente: edad, alergias, número de consultas y fecha de la última consulta.',
    pipeline: [
      { $lookup: { from: 'consultas', localField: '_id', foreignField: 'paciente_id', as: 'cons', pipeline: [{ $project: { fecha: 1 } }] } },
      { $project: {
          cedula: 1, activo: 1, nombre_completo: { $concat: ['$nombre', ' ', '$apellidos'] },
          edad: { $dateDiff: { startDate: '$fecha_nacimiento', endDate: '$$NOW', unit: 'year' } },
          sexo: 1, alergias: 1, total_consultas: { $size: '$cons' }, ultima_consulta: { $max: '$cons.fecha' }
      } }
    ]
  },
  {
    nombre: 'v_consultas_por_centro_mes',
    base: 'consultas',
    descripcion: 'Cantidad de consultas por centro de salud y mes (reportería).',
    pipeline: [
      { $group: { _id: { centro_id: '$centro_id', anio: { $year: '$fecha' }, mes: { $month: '$fecha' } }, total: { $sum: 1 } } },
      { $lookup: { from: 'centros_salud', localField: '_id.centro_id', foreignField: '_id', as: 'c' } },
      { $project: { _id: 0, centro: { $first: '$c.nombre' }, anio: '$_id.anio', mes: '$_id.mes', total: 1 } },
      { $sort: { anio: -1, mes: -1, total: -1 } }
    ]
  },
  {
    nombre: 'v_diagnosticos_frecuentes',
    base: 'consultas',
    descripcion: 'Diagnósticos CIE-10 ordenados por frecuencia (detección de patrones).',
    pipeline: [
      { $unwind: '$diagnosticos' },
      { $group: { _id: '$diagnosticos.cie10', descripcion: { $first: '$diagnosticos.descripcion' }, casos: { $sum: 1 }, pacientes: { $addToSet: '$paciente_id' } } },
      { $project: { _id: 0, cie10: '$_id', descripcion: 1, casos: 1, pacientes_distintos: { $size: '$pacientes' } } },
      { $sort: { casos: -1 } }
    ]
  },
  {
    nombre: 'v_medicamentos_mas_recetados',
    base: 'prescripciones',
    descripcion: 'Medicamentos más recetados y número de pacientes distintos.',
    pipeline: [
      { $unwind: '$medicamentos' },
      { $group: { _id: '$medicamentos.nombre', veces: { $sum: 1 }, pacientes: { $addToSet: '$paciente_id' } } },
      { $project: { _id: 0, medicamento: '$_id', veces: 1, pacientes_distintos: { $size: '$pacientes' } } },
      { $sort: { veces: -1 } }
    ]
  },
  {
    nombre: 'v_resultados_laboratorio_anormales',
    base: 'examenes_laboratorio',
    descripcion: 'Resultados de laboratorio fuera de su rango de referencia, con el nombre del paciente.',
    pipeline: [
      { $unwind: '$resultados' },
      { $match: { $expr: { $or: [{ $lt: ['$resultados.valor', '$resultados.rango.min'] }, { $gt: ['$resultados.valor', '$resultados.rango.max'] }] } } },
      { $lookup: { from: 'pacientes', localField: 'paciente_id', foreignField: '_id', as: 'p' } },
      { $project: {
          paciente_id: 1, paciente: { $concat: [{ $first: '$p.nombre' }, ' ', { $first: '$p.apellidos' }] }, tipo: 1, fecha: 1,
          parametro: '$resultados.parametro', valor: '$resultados.valor', unidad: '$resultados.unidad', rango: '$resultados.rango',
          interpretacion: { $cond: [{ $lt: ['$resultados.valor', '$resultados.rango.min'] }, 'bajo', 'alto'] }
      } },
      { $sort: { fecha: -1 } }
    ]
  },
  {
    nombre: 'v_actividad_por_usuario',
    base: 'bitacora_accesos',
    descripcion: 'Auditoría: número de accesos por usuario y tipo de acción.',
    pipeline: [
      { $group: { _id: { usuario_id: '$usuario_id', accion: '$accion' }, total: { $sum: 1 }, ultimo: { $max: '$fecha' } } },
      { $lookup: { from: 'usuarios', localField: '_id.usuario_id', foreignField: '_id', as: 'u' } },
      { $project: { _id: 0, username: { $first: '$u.username' }, rol: { $first: '$u.rol' }, accion: '$_id.accion', total: 1, ultimo: 1 } },
      { $sort: { total: -1 } }
    ]
  }
];

export async function crearVistas() {
  const db = await conectar();
  for (const v of vistas) {
    await db.collection(v.nombre).drop().catch(() => {});   // idempotente
    await db.createCollection(v.nombre, { viewOn: v.base, pipeline: v.pipeline });
    console.log(`+ vista creada: ${v.nombre}  (sobre ${v.base})`);
  }
}

// Ejecución directa: node database/vistas.js
if (import.meta.url === `file://${process.argv[1]}`) {
  await crearVistas();
  await desconectar();
}
