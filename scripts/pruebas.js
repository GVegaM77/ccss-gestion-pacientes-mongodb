// Pruebas automáticas (node:test). Requiere haber ejecutado antes: npm run db:init
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { conectar, desconectar } from '../src/config/db.js';
import { pacientes, usuarios, bitacora, imagenes } from '../src/crud/index.js';
import * as sp from '../src/procedimientos/index.js';
import * as fn from '../src/funciones/index.js';
import * as cur from '../src/cursores/index.js';
import { vistas } from '../database/vistas.js';
import { hashPassword, verificarPassword } from '../src/utils/seguridad.js';

const db = await conectar();
after(async () => { await desconectar(); });

test('conexión: ping al servidor', async () => {
  assert.equal((await db.command({ ping: 1 })).ok, 1);
});

test('validación $jsonSchema rechaza una cédula inválida', async () => {
  await assert.rejects(pacientes.crear({ cedula: 'abc', nombre: 'X', apellidos: 'Y', fecha_nacimiento: '2000-01-01', sexo: 'F' }), /Document failed validation/);
});

test('índice único impide cédulas duplicadas', async () => {
  const existente = await db.collection('pacientes').findOne({});
  await assert.rejects(pacientes.crear({ cedula: existente.cedula, nombre: 'Dup', apellidos: 'Dup', fecha_nacimiento: '2000-01-01', sexo: 'M' }), (e) => e.code === 11000);
});

test('CRUD de pacientes: crear, leer, actualizar, borrado lógico', async () => {
  const p = await pacientes.crear({ cedula: '888000222', nombre: 'Test', apellidos: 'Crud', fecha_nacimiento: '1985-03-02', sexo: 'M' });
  assert.equal((await pacientes.obtenerPorId(p._id)).nombre, 'Test');
  assert.equal((await pacientes.actualizar(p._id, { nombre: 'Test2' })).nombre, 'Test2');
  assert.equal(await pacientes.eliminar(p._id), true);
  assert.equal((await pacientes.obtenerPorId(p._id)).activo, false);
  await db.collection('pacientes').deleteOne({ _id: p._id });
});

test('usuarios: guarda hash, no lo devuelve y autentica', async () => {
  const centro = await db.collection('centros_salud').findOne({});
  const u = await usuarios.crear({ username: 'test_user', password: 'Segura#2026', rol: 'analista', centro_id: centro._id });
  assert.equal(u.password_hash, undefined);
  const crudo = await db.collection('usuarios').findOne({ _id: u._id });
  assert.notEqual(crudo.password_hash, 'Segura#2026');
  assert.ok(await usuarios.autenticar('test_user', 'Segura#2026'));
  assert.equal(await usuarios.autenticar('test_user', 'mala'), null);
  await db.collection('usuarios').deleteOne({ _id: u._id });
});

test('bitácora es de solo inserción', () => {
  assert.equal(bitacora.actualizar, undefined);
  assert.equal(bitacora.eliminar, undefined);
});

test('hash scrypt: verifica correctamente', () => {
  const h = hashPassword('Clave#12345');
  assert.ok(verificarPassword('Clave#12345', h));
  assert.ok(!verificarPassword('otra', h));
});

test('funciones: IMC, presión, resultado de laboratorio, edad', () => {
  assert.equal(fn.calcularIMC(72, 1.7), 24.9);
  assert.equal(fn.clasificarIMC(24.9), 'Normal');
  assert.equal(fn.clasificarPresion('145/95'), 'Hipertensión');
  assert.equal(fn.interpretarResultado(8, { min: 11, max: 17 }), 'bajo');
  assert.equal(fn.calcularEdad('2000-06-15', new Date('2026-06-14')), 25);
  assert.equal(fn.calcularEdad('2000-06-15', new Date('2026-06-15')), 26);
  assert.throws(() => fn.calcularIMC(0, 1.7));
});

test('$function en el servidor clasifica a todos los pacientes', async () => {
  const r = await db.collection('pacientes').aggregate([fn.etapaGrupoEtario(), { $match: { grupo_etario: { $exists: true } } }, { $count: 'n' }]).toArray();
  assert.equal(r[0].n, await db.collection('pacientes').countDocuments());
});

test('vistas: las 7 existen y se pueden consultar', async () => {
  const nombres = new Set((await db.listCollections({ type: 'view' }).toArray()).map((v) => v.name));
  for (const v of vistas) {
    assert.ok(nombres.has(v.nombre), `falta ${v.nombre}`);
    await db.collection(v.nombre).find({}).limit(1).toArray();
  }
});

test('procedimiento: registrarConsulta confirma la transacción completa', async () => {
  const u = await db.collection('usuarios').findOne({ rol: 'medico' });
  const prof = await db.collection('profesionales').findOne({ _id: u.profesional_id });
  const pac = await db.collection('pacientes').findOne({ alergias: { $size: 0 }, activo: true });
  const r = await sp.registrarConsulta({
    consulta: { paciente_id: pac._id, profesional_id: prof._id, centro_id: prof.centro_id, motivo: 'Prueba' },
    prescripcion: { medicamentos: [{ nombre: 'Acetaminofén', dosis: '500 mg', frecuencia: 'cada 8 horas', dias: 3 }] }
  }, { usuarioId: u._id });
  assert.ok(await db.collection('consultas').findOne({ _id: r.consulta_id }));
  assert.ok(await db.collection('prescripciones').findOne({ _id: r.prescripcion_id }));
  await db.collection('consultas').deleteOne({ _id: r.consulta_id });
  await db.collection('prescripciones').deleteOne({ _id: r.prescripcion_id });
});

test('procedimiento: rollback si falla una parte (alergia y violación de esquema)', async () => {
  const u = await db.collection('usuarios').findOne({ rol: 'medico' });
  const prof = await db.collection('profesionales').findOne({ _id: u.profesional_id });
  const alergico = await db.collection('pacientes').findOne({ alergias: 'penicilina', activo: true });
  const antes = await db.collection('consultas').countDocuments();
  const base = { paciente_id: alergico._id, profesional_id: prof._id, centro_id: prof.centro_id, motivo: 'Prueba' };
  await assert.rejects(sp.registrarConsulta({ consulta: base, prescripcion: { medicamentos: [{ nombre: 'Penicilina', dosis: '1', frecuencia: '1', dias: 1 }] } }, { usuarioId: u._id }), /Alergia detectada/);
  await assert.rejects(sp.registrarConsulta({ consulta: base, examenes: [{ tipo: 'X', resultados: [{ parametro: 'p', valor: 'no-numero' }] }] }, { usuarioId: u._id }), /validation/);
  assert.equal(await db.collection('consultas').countDocuments(), antes);
});

test('cursores: la paginación por keyset recorre todo sin repetir', async () => {
  const [{ _id: pid, n }] = await db.collection('consultas').aggregate([{ $group: { _id: '$paciente_id', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray();
  const vistos = new Set();
  let pag = await cur.paginarConsultas(pid, 2);
  pag.datos.forEach((d) => vistos.add(String(d._id)));
  while (pag.siguiente) { pag = await cur.paginarConsultas(pid, 2, pag.siguiente); pag.datos.forEach((d) => vistos.add(String(d._id))); }
  assert.equal(vistos.size, n);
});

test('cursores: recorrerPacientes procesa todos los activos', async () => {
  let c = 0;
  const n = await cur.recorrerPacientes(25, () => { c++; });
  assert.equal(n, c);
  assert.equal(n, await db.collection('pacientes').countDocuments({ activo: true }));
});

test('GridFS: subir y descargar una imagen médica', async () => {
  const c = await db.collection('consultas').findOne({});
  const doc = await imagenes.subir({ paciente_id: c.paciente_id, consulta_id: c._id, tipo: 'ECG', formato: 'PDF', equipo: 'Test' }, Buffer.from('contenido-binario'), 'ecg_test.pdf');
  assert.equal((await imagenes.descargar(doc._id)).toString(), 'contenido-binario');
  assert.equal(await imagenes.eliminar(doc._id), true);
});
