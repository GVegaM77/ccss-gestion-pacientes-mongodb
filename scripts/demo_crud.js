// Demostración de CRUD sobre las colecciones principales (los registros de prueba se limpian al terminar).
import { conectar, desconectar } from '../src/config/db.js';
import { pacientes, consultas, centros, profesionales, usuarios, prescripciones, cirugias, bitacora } from '../src/crud/index.js';

const db = await conectar();
const titulo = (t) => console.log(`\n=== ${t} ===`);

titulo('PACIENTES');
const nuevo = await pacientes.crear({ cedula: '999000111', nombre: 'Prueba', apellidos: 'Demo Uno', fecha_nacimiento: '1990-05-17', sexo: 'F', alergias: ['penicilina'] });
console.log('CREATE  ->', nuevo._id.toString(), nuevo.nombre);
console.log('READ    ->', (await pacientes.obtenerPorId(nuevo._id)).cedula);
console.log('UPDATE  ->', (await pacientes.actualizar(nuevo._id, { contacto: { telefono: '8888-0000', correo: 'demo@correo.cr' } })).contacto);
const lista = await pacientes.listar({ activo: true }, { pagina: 1, tamano: 3, orden: { apellidos: 1 } });
console.log('LIST    ->', `${lista.datos.length} de ${lista.total} pacientes activos`);
console.log('DELETE (lógico) ->', await pacientes.eliminar(nuevo._id), '| activo =', (await pacientes.obtenerPorId(nuevo._id)).activo);

titulo('CONSULTAS');
const prof = (await profesionales.listar({}, { tamano: 1 })).datos[0];
const p2 = (await pacientes.listar({ activo: true }, { tamano: 1 })).datos[0];
const cons = await consultas.crear({ paciente_id: p2._id, profesional_id: prof._id, centro_id: prof.centro_id, fecha: new Date(), motivo: 'Control (demo)', diagnosticos: [{ cie10: 'I10', descripcion: 'Hipertensión esencial' }] });
console.log('CREATE  ->', cons._id.toString());
console.log('UPDATE  ->', (await consultas.actualizar(cons._id, { comentarios_medico: 'Actualizado en demo' })).comentarios_medico);
console.log('DELETE  ->', await consultas.eliminar(cons._id));

titulo('USUARIOS (con hash)');
const u = await usuarios.crear({ username: 'demo_user', password: 'ClaveDemo#1', rol: 'enfermeria', centro_id: prof.centro_id });
console.log('CREATE  ->', u.username, '| campos devueltos:', Object.keys(u).join(', '));
console.log('LOGIN ok ->', !!(await usuarios.autenticar('demo_user', 'ClaveDemo#1')), '| LOGIN mal ->', !!(await usuarios.autenticar('demo_user', 'otra')));
console.log('DESACTIVAR ->', await usuarios.desactivar(u._id));
await db.collection('usuarios').deleteOne({ _id: u._id });

titulo('CENTROS (búsqueda geoespacial)');
const cerca = await centros.buscarCercanos(-84.09, 9.935, 3000);
console.log('Centros a menos de 3 km:', cerca.map((c) => c.codigo).join(', '));

titulo('BITÁCORA (solo inserción)');
try { await bitacora.actualizar?.('x', {}); } catch { /* no existe */ }
console.log('actualizar disponible?', typeof bitacora.actualizar, '| eliminar disponible?', typeof bitacora.eliminar);
await db.collection('pacientes').deleteOne({ _id: nuevo._id }); // limpieza del paciente de prueba
await desconectar();
