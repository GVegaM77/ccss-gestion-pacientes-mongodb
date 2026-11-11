// Repositorios CRUD de las colecciones principales + operaciones propias de cada una.
import { GridFSBucket } from 'mongodb';
import { conectar } from '../config/db.js';
import { crearRepositorio } from './repositorio.js';
import { aObjectId, normalizar } from '../utils/ids.js';
import { hashPassword, verificarPassword } from '../utils/seguridad.js';

// ---------- pacientes (borrado lógico: el expediente nunca se elimina) ----------
export const pacientes = {
  ...crearRepositorio('pacientes', {
    permitirEliminar: false,
    antesDeCrear: (d) => ({ alergias: [], antecedentes: [], contactos_emergencia: [], activo: true, ...d })
  }),
  async buscarPorCedula(cedula) {
    return (await conectar()).collection('pacientes').findOne({ cedula });
  },
  async buscarPorNombre(texto, limite = 20) {
    const rx = new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // escapa caracteres especiales (evita inyección de regex)
    return (await conectar()).collection('pacientes').find({ $or: [{ nombre: rx }, { apellidos: rx }] }).limit(limite).toArray();
  },
  /** "Eliminar" = marcar inactivo. */
  async desactivar(id) {
    const r = await (await conectar()).collection('pacientes').updateOne({ _id: aObjectId(id) }, { $set: { activo: false } });
    return r.modifiedCount === 1;
  }
};
// Para uso homogéneo: pacientes.eliminar es el borrado lógico
pacientes.eliminar = pacientes.desactivar;

// ---------- consultas ----------
export const consultas = {
  ...crearRepositorio('consultas'),
  async listarPorPaciente(pacienteId, limite = 50) {
    return (await conectar()).collection('consultas').find({ paciente_id: aObjectId(pacienteId) }).sort({ fecha: -1 }).limit(limite).toArray();
  }
};

// ---------- prescripciones ----------
export const prescripciones = {
  ...crearRepositorio('prescripciones', { antesDeCrear: (d) => ({ estado: 'activa', ...d }) }),
  async listarActivasDePaciente(pacienteId) {
    return (await conectar()).collection('prescripciones').find({ paciente_id: aObjectId(pacienteId), estado: 'activa' }).sort({ fecha: -1 }).toArray();
  }
};

// ---------- exámenes de laboratorio ----------
export const examenes = {
  ...crearRepositorio('examenes_laboratorio'),
  async listarPorPaciente(pacienteId) {
    return (await conectar()).collection('examenes_laboratorio').find({ paciente_id: aObjectId(pacienteId) }).sort({ fecha: -1 }).toArray();
  }
};

// ---------- centros de salud ----------
export const centros = {
  ...crearRepositorio('centros_salud'),
  /** Centros dentro de una distancia (metros) de un punto; $near usa el índice 2dsphere. */
  async buscarCercanos(longitud, latitud, metros = 10000) {
    return (await conectar()).collection('centros_salud').find({
      ubicacion: { $near: { $geometry: { type: 'Point', coordinates: [longitud, latitud] }, $maxDistance: metros } }
    }).toArray();
  }
};

// ---------- profesionales ----------
export const profesionales = {
  ...crearRepositorio('profesionales'),
  async listarPorCentro(centroId) {
    return (await conectar()).collection('profesionales').find({ centro_id: aObjectId(centroId) }).toArray();
  }
};

// ---------- usuarios (la contraseña se guarda con hash y nunca se devuelve) ----------
const repoUsuarios = crearRepositorio('usuarios', { proyeccion: { password_hash: 0 }, permitirEliminar: false });
export const usuarios = {
  ...repoUsuarios,
  /** Recibe "password" en texto plano, guarda solo su hash scrypt. */
  async crear({ password, ...datos }) {
    const doc = normalizar({ activo: true, ...datos, password_hash: hashPassword(password) });
    const { insertedId } = await (await conectar()).collection('usuarios').insertOne(doc);
    const { password_hash, ...seguro } = doc;
    return { _id: insertedId, ...seguro };
  },
  /** Devuelve el usuario (sin hash) si las credenciales son correctas y la cuenta está activa; si no, null. */
  async autenticar(username, password) {
    const u = await (await conectar()).collection('usuarios').findOne({ username, activo: true });
    if (!u || !verificarPassword(password, u.password_hash)) return null;
    const { password_hash, ...seguro } = u;
    return seguro;
  },
  async cambiarPassword(id, nueva) {
    const r = await (await conectar()).collection('usuarios').updateOne({ _id: aObjectId(id) }, { $set: { password_hash: hashPassword(nueva) } });
    return r.modifiedCount === 1;
  },
  async desactivar(id) {
    const r = await (await conectar()).collection('usuarios').updateOne({ _id: aObjectId(id) }, { $set: { activo: false } });
    return r.modifiedCount === 1;
  }
};
usuarios.eliminar = usuarios.desactivar;

// ---------- cirugías ----------
export const cirugias = {
  ...crearRepositorio('cirugias', { antesDeCrear: (d) => ({ estado: 'programada', equipo: [], ruta_quirurgica: [], ...d }) }),
  async listarPorPaciente(pacienteId) {
    return (await conectar()).collection('cirugias').find({ paciente_id: aObjectId(pacienteId) }).sort({ fecha: -1 }).toArray();
  }
};

// ---------- imágenes médicas: metadatos en la colección + archivo en GridFS ----------
const repoImagenes = crearRepositorio('imagenes_medicas');
export const imagenes = {
  ...repoImagenes,
  /** Sube el archivo (Buffer) a GridFS y crea el documento de metadatos enlazado por archivo_id. */
  async subir({ paciente_id, consulta_id, tipo, informe, formato, equipo, fecha = new Date() }, buffer, nombreArchivo) {
    const db = await conectar();
    const bucket = new GridFSBucket(db, { bucketName: 'imagenes' });
    const flujo = bucket.openUploadStream(nombreArchivo, { metadata: { paciente_id: aObjectId(paciente_id), tipo } });
    await new Promise((ok, mal) => flujo.once('finish', ok).once('error', mal).end(buffer));
    return repoImagenes.crear({
      paciente_id, consulta_id, tipo, informe, fecha,
      archivo_id: flujo.id,
      metadatos: { formato, tamano: buffer.length, equipo }
    });
  },
  /** Descarga el contenido binario de una imagen a partir del id de su documento. */
  async descargar(id) {
    const doc = await repoImagenes.obtenerPorId(id);
    if (!doc?.archivo_id) return null;
    const bucket = new GridFSBucket(await conectar(), { bucketName: 'imagenes' });
    const partes = [];
    for await (const parte of bucket.openDownloadStream(doc.archivo_id)) partes.push(parte);
    return Buffer.concat(partes);
  },
  /** Elimina el documento y su archivo en GridFS. */
  async eliminar(id) {
    const doc = await repoImagenes.obtenerPorId(id);
    if (!doc) return false;
    if (doc.archivo_id) await new GridFSBucket(await conectar(), { bucketName: 'imagenes' }).delete(doc.archivo_id);
    return repoImagenes.eliminar(id);
  }
};

// ---------- bitácora de accesos: solo CREATE y READ ----------
const repoBitacora = crearRepositorio('bitacora_accesos', { permitirActualizar: false, permitirEliminar: false });
export const bitacora = {
  crear: (datos) => repoBitacora.crear({ fecha: new Date(), ...datos }),
  obtenerPorId: repoBitacora.obtenerPorId,
  listar: repoBitacora.listar,
  async listarPorPaciente(pacienteId, limite = 100) {
    return (await conectar()).collection('bitacora_accesos').find({ paciente_id: aObjectId(pacienteId) }).sort({ fecha: -1 }).limit(limite).toArray();
  }
};
