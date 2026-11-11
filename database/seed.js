// Datos de prueba (ficticios). Uso: node database/seed.js [numPacientes]   (por defecto 200)
// ADVERTENCIA: vacía las colecciones antes de insertar. Úselo solo en entornos de desarrollo.
import { conectar, desconectar } from '../src/config/db.js';
import { colecciones } from './schemas.js';
import { hashPassword } from '../src/utils/seguridad.js';
import { imagenes } from '../src/crud/index.js';

const N = Number(process.argv[2] || 200);
let semilla = 20261013; // generador pseudoaleatorio determinista: los datos son reproducibles
const rnd = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const elegir = (a) => a[Math.floor(rnd() * a.length)];
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const dec = (a, b, d = 1) => Number((a + rnd() * (b - a)).toFixed(d)) + 0.01 * 0; // siempre double con decimales
const diasAtras = (d) => new Date(Date.now() - d * 86400000);

const db = await conectar();
for (const nombre of Object.keys(colecciones)) await db.collection(nombre).deleteMany({});
await db.collection('imagenes.files').deleteMany({});
await db.collection('imagenes.chunks').deleteMany({});

// ---- centros de salud ----
const centrosDef = [
  ['HSJD', 'Hospital San Juan de Dios', 'hospital', -84.0863, 9.9341, ['Urgencias', 'Cirugía', 'Medicina Interna', 'Laboratorio', 'Radiología']],
  ['HCG', 'Hospital Dr. Rafael Ángel Calderón Guardia', 'hospital', -84.0725, 9.9356, ['Urgencias', 'Cirugía', 'Cardiología', 'Laboratorio', 'Radiología']],
  ['HMEX', 'Hospital México', 'hospital', -84.1115, 9.9558, ['Urgencias', 'Cirugía', 'Oncología', 'Laboratorio', 'Radiología']],
  ['CLPAV', 'Clínica de Pavas', 'clinica', -84.1226, 9.9402, ['Medicina General', 'Pediatría', 'Laboratorio']],
  ['EBPAV1', 'EBAIS Pavas 1', 'ebais', -84.1301, 9.9367, ['Medicina General', 'Enfermería']],
  ['EBCOR', 'EBAIS Coronado', 'ebais', -84.0121, 9.9738, ['Medicina General', 'Enfermería']]
];
const centros = centrosDef.map(([codigo, nombre, tipo, lng, lat, servicios]) => ({ codigo, nombre, tipo, ubicacion: { type: 'Point', coordinates: [lng, lat] }, servicios }));
const rc = await db.collection('centros_salud').insertMany(centros);
const centroIds = Object.values(rc.insertedIds);

// ---- profesionales y usuarios ----
const nombresM = ['Carlos', 'Luis', 'Andrés', 'José', 'Mario', 'Diego', 'Daniel', 'Jorge', 'Esteban', 'Mauricio'];
const nombresF = ['María', 'Ana', 'Laura', 'Sofía', 'Daniela', 'Karla', 'Paola', 'Andrea', 'Gabriela', 'Valeria'];
const apellidos = ['Rodríguez', 'Jiménez', 'Mora', 'Vargas', 'Solano', 'Araya', 'Quesada', 'Castro', 'Rojas', 'Hernández', 'Chaves', 'Salazar', 'Alfaro', 'Campos', 'Brenes', 'Zúñiga'];
const especialidades = ['Medicina General', 'Medicina Interna', 'Cardiología', 'Pediatría', 'Cirugía General', 'Radiología', 'Enfermería'];
const profs = Array.from({ length: 12 }, (_, i) => ({
  cedula: String(100000000 + i * 7919 + 1),
  nombre: `Dr(a). ${elegir([...nombresM, ...nombresF])} ${elegir(apellidos)} ${elegir(apellidos)}`,
  especialidad: especialidades[i % especialidades.length],
  codigo_profesional: `MED-${10000 + i}`,
  centro_id: centroIds[i % 3]
}));
const rp = await db.collection('profesionales').insertMany(profs);
const profIds = Object.values(rp.insertedIds);

const rolesBase = ['medico', 'medico', 'enfermeria', 'laboratorio', 'medico', 'medico'];
const usuarios = profIds.slice(0, 6).map((pid, i) => ({
  username: `usuario${i + 1}`, password_hash: hashPassword('Clave#2026'), rol: rolesBase[i], profesional_id: pid, centro_id: profs[i].centro_id, activo: true
}));
usuarios.push({ username: 'admin', password_hash: hashPassword('Admin#2026'), rol: 'admin', centro_id: centroIds[0], activo: true });
usuarios.push({ username: 'analista', password_hash: hashPassword('Analista#2026'), rol: 'analista', centro_id: centroIds[0], activo: true });
const ru = await db.collection('usuarios').insertMany(usuarios);
const usuarioIds = Object.values(ru.insertedIds);

// ---- pacientes ----
const alergiasPosibles = ['penicilina', 'ibuprofeno', 'látex', 'mariscos', 'aspirina', 'sulfas'];
const antecedentesPosibles = ['Hipertensión arterial', 'Diabetes tipo 2', 'Asma', 'Cardiopatía familiar', 'Tabaquismo', 'Cirugía previa de apéndice'];
const lugares = [['San José', 'San José', 'Hospital'], ['San José', 'Escazú', 'San Rafael'], ['San José', 'Goicoechea', 'Guadalupe'], ['Heredia', 'Heredia', 'Mercedes'], ['Cartago', 'Cartago', 'Oriental'], ['Alajuela', 'Alajuela', 'San José']];
const pacientes = Array.from({ length: N }, (_, i) => {
  const sexo = elegir(['F', 'M']);
  const [provincia, canton, distrito] = elegir(lugares);
  const nombre = elegir(sexo === 'F' ? nombresF : nombresM);
  return {
    cedula: String(200000000 + i * 3 + 1),
    nombre, apellidos: `${elegir(apellidos)} ${elegir(apellidos)}`,
    fecha_nacimiento: diasAtras(entre(1, 90) * 365 + entre(0, 364)),
    sexo,
    contacto: { telefono: `8${entre(1000, 9999)}-${entre(1000, 9999)}`, correo: `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@correo.cr` },
    direccion: { provincia, canton, distrito },
    alergias: rnd() < 0.25 ? [elegir(alergiasPosibles)] : [],
    antecedentes: rnd() < 0.5 ? [elegir(antecedentesPosibles)] : [],
    contactos_emergencia: [{ nombre: `${elegir(nombresF)} ${elegir(apellidos)}`, parentesco: elegir(['Madre', 'Esposo(a)', 'Hermano(a)', 'Hijo(a)']), telefono: `6${entre(1000, 9999)}-${entre(1000, 9999)}` }],
    activo: true
  };
});
const rpa = await db.collection('pacientes').insertMany(pacientes);
const pacienteIds = Object.values(rpa.insertedIds);

// ---- consultas, prescripciones y exámenes ----
const dx = [['I10', 'Hipertensión esencial'], ['E11.9', 'Diabetes mellitus tipo 2'], ['J45.9', 'Asma'], ['J06.9', 'Infección respiratoria aguda'], ['R07.4', 'Dolor torácico'], ['K29.7', 'Gastritis'], ['M54.5', 'Lumbalgia'], ['A09', 'Gastroenteritis']];
const motivos = ['Control de rutina', 'Dolor torácico', 'Fiebre', 'Dolor abdominal', 'Tos persistente', 'Dolor lumbar', 'Control de presión'];
const meds = [['Acetaminofén', '500 mg', 'cada 8 horas', 5], ['Losartán', '50 mg', 'cada 24 horas', 30], ['Metformina', '850 mg', 'cada 12 horas', 30], ['Amoxicilina', '500 mg', 'cada 8 horas', 7], ['Omeprazol', '20 mg', 'cada 24 horas', 14], ['Salbutamol', '2 inhalaciones', 'cada 6 horas', 10]];
const lab = [
  ['Hemograma', [['Hemoglobina', 11, 17, 'g/dL', 9, 19], ['Leucocitos', 4, 11, '10^3/µL', 2, 16]]],
  ['Perfil lipídico', [['Colesterol total', 0, 200, 'mg/dL', 120, 300], ['Triglicéridos', 0, 150, 'mg/dL', 60, 350]]],
  ['Glicemia', [['Glucosa en ayunas', 70, 100, 'mg/dL', 60, 220]]]
];
const consultas = [], prescs = [], exs = [];
const { ObjectId } = await import('mongodb');
for (let i = 0; i < pacienteIds.length; i++) {
  const p = pacientes[i];
  for (let k = 0, n = entre(2, 8); k < n; k++) {
    const pi = entre(0, profIds.length - 1);
    const fecha = diasAtras(entre(1, 730));
    const _id = new ObjectId();
    const d = elegir(dx);
    const talla = dec(1.5, 1.9, 2);
    consultas.push({
      _id, paciente_id: pacienteIds[i], profesional_id: profIds[pi], centro_id: profs[pi].centro_id, fecha,
      motivo: elegir(motivos),
      signos_vitales: { pa: `${entre(100, 160)}/${entre(60, 100)}`, fc: entre(55, 110), temp: dec(36, 39.2, 1), peso: dec(45, 110, 1), talla },
      diagnosticos: [{ cie10: d[0], descripcion: d[1] }],
      comentarios_medico: rnd() < 0.5 ? 'Se indica seguimiento en 15 días.' : 'Se solicitan exámenes de control.'
    });
    if (rnd() < 0.6) {
      const m = meds.filter(([nombre]) => !p.alergias.some((a) => nombre.toLowerCase().includes(a)));
      const [nombre, dosis, frecuencia, dias] = elegir(m);
      prescs.push({ consulta_id: _id, paciente_id: pacienteIds[i], profesional_id: profIds[pi], fecha, estado: 'activa', medicamentos: [{ nombre, dosis, frecuencia, dias }] });
    }
    if (rnd() < 0.4) {
      const [tipo, params] = elegir(lab);
      exs.push({
        paciente_id: pacienteIds[i], consulta_id: _id, tipo, fecha,
        resultados: params.map(([parametro, min, max, unidad, lo, hi]) => ({ parametro, valor: dec(lo, hi, 1), unidad, rango: { min, max } }))
      });
    }
  }
}
await db.collection('consultas').insertMany(consultas);
await db.collection('prescripciones').insertMany(prescs);
await db.collection('examenes_laboratorio').insertMany(exs);
// las prescripciones con más de 'dias' desde su fecha se finalizarán con el procedimiento sp_finalizar_prescripciones_vencidas

// ---- cirugías ----
const cirs = Array.from({ length: Math.max(5, Math.floor(N / 10)) }, (_, i) => {
  const cx = consultas[i * 3];
  const realizada = rnd() < 0.5;
  return {
    paciente_id: cx.paciente_id, centro_id: cx.centro_id,
    procedimiento: elegir(['Apendicectomía', 'Colecistectomía', 'Hernioplastia', 'Cesárea', 'Reemplazo de cadera']),
    fecha: realizada ? cx.fecha : new Date(Date.now() + entre(1, 60) * 86400000),
    equipo: [{ profesional_id: cx.profesional_id, rol: 'Cirujano principal' }],
    ruta_quirurgica: realizada ? [{ etapa: 'Ingreso a sala', hora: cx.fecha }, { etapa: 'Cierre', hora: new Date(cx.fecha.getTime() + 5400000) }] : [],
    estado: realizada ? 'realizada' : 'programada'
  };
});
await db.collection('cirugias').insertMany(cirs);

// ---- imágenes médicas (archivo en GridFS) ----
for (let i = 0; i < 3; i++) {
  const cx = consultas[i * 5];
  await imagenes.subir(
    { paciente_id: cx.paciente_id, consulta_id: cx._id, tipo: ['rayosX', 'ecografia', 'ECG'][i], informe: 'Sin hallazgos agudos.', formato: 'JPG', equipo: 'Equipo de prueba' },
    Buffer.from(`imagen-de-prueba-${i}`), `imagen_${i}.jpg`
  );
}

// ---- bitácora ----
const bit = Array.from({ length: Math.min(500, N * 3) }, () => ({
  usuario_id: elegir(usuarioIds), paciente_id: elegir(pacienteIds), accion: elegir(['lectura', 'lectura', 'lectura', 'escritura', 'exportacion']), fecha: diasAtras(entre(0, 60)), ip: `10.0.${entre(0, 5)}.${entre(1, 250)}`
}));
await db.collection('bitacora_accesos').insertMany(bit);

for (const nombre of Object.keys(colecciones)) console.log(`${nombre.padEnd(22)} ${await db.collection(nombre).countDocuments()} documentos`);
await desconectar();
