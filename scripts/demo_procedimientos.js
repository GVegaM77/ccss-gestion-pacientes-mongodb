import { conectar, desconectar } from '../src/config/db.js';
import * as sp from '../src/procedimientos/index.js';

const db = await conectar();
const usuario = await db.collection('usuarios').findOne({ rol: 'medico' });
const prof = await db.collection('profesionales').findOne({ _id: usuario.profesional_id });
const sano = await db.collection('pacientes').findOne({ alergias: { $size: 0 }, activo: true });
const alergico = await db.collection('pacientes').findOne({ alergias: 'penicilina', activo: true });
const ctx = { usuarioId: usuario._id, ip: '10.0.0.99' };
const base = (p) => ({ paciente_id: p._id, profesional_id: prof._id, centro_id: prof.centro_id, motivo: 'Fiebre', diagnosticos: [{ cie10: 'J06.9', descripcion: 'Infección respiratoria aguda' }] });

console.log('1) sp_registrar_consulta (paciente sin alergias):');
console.log(await sp.registrarConsulta({
  consulta: base(sano),
  prescripcion: { medicamentos: [{ nombre: 'Acetaminofén', dosis: '500 mg', frecuencia: 'cada 8 horas', dias: 3 }] },
  examenes: [{ tipo: 'Hemograma', resultados: [{ parametro: 'Hemoglobina', valor: 13.2, unidad: 'g/dL', rango: { min: 11, max: 17 } }] }]
}, ctx));

console.log('\n2) sp_registrar_consulta con alergia (debe fallar y hacer ROLLBACK):');
const antes = await db.collection('consultas').countDocuments();
try {
  await sp.registrarConsulta({ consulta: base(alergico), prescripcion: { medicamentos: [{ nombre: 'Penicilina V', dosis: '500 mg', frecuencia: 'cada 8 horas', dias: 7 }] } }, ctx);
} catch (e) { console.log('  Error esperado:', e.message); }
console.log('  Consultas antes/después:', antes, '/', await db.collection('consultas').countDocuments());

console.log('\n2b) Rollback real: el examen viola el $jsonSchema DESPUÉS de insertar la consulta:');
const antes2 = await db.collection('consultas').countDocuments();
try {
  await sp.registrarConsulta({ consulta: base(sano), examenes: [{ tipo: 'Hemograma', resultados: [{ parametro: 'Hemoglobina', valor: 'texto-invalido' }] }] }, ctx);
} catch (e) { console.log('  Error esperado:', e.codeName ?? e.message); }
console.log('  Consultas antes/después:', antes2, '/', await db.collection('consultas').countDocuments(), '(la consulta insertada se deshizo)');

console.log('\n3) sp_consultar_expediente:');
const exp = await sp.consultarExpediente(sano._id, ctx);
console.log(`  ${exp.paciente.nombre}: ${exp.consultas.length} consultas, ${exp.prescripciones_activas.length} prescripciones activas, ${exp.examenes.length} exámenes`);

console.log('\n4) sp_finalizar_prescripciones_vencidas:');
console.log(' ', await sp.finalizarPrescripcionesVencidas());

console.log('\n5) sp_registrar_cirugia_realizada:');
const cir = await db.collection('cirugias').findOne({ estado: 'programada' });
const r = await sp.registrarCirugiaRealizada(cir._id, [{ etapa: 'Ingreso a sala', hora: new Date().toISOString() }], ctx);
console.log(' ', r.procedimiento, '->', r.estado, '| etapas:', r.ruta_quirurgica.length);
try { await sp.registrarCirugiaRealizada(cir._id, [], ctx); } catch (e) { console.log('  Segundo intento (esperado):', e.message); }
await desconectar();
