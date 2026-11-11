import { ObjectId } from 'mongodb';

/** Convierte un string a ObjectId; lanza un error claro si no es válido. */
export function aObjectId(valor, campo = '_id') {
  if (valor instanceof ObjectId) return valor;
  if (typeof valor === 'string' && ObjectId.isValid(valor) && /^[0-9a-fA-F]{24}$/.test(valor)) return new ObjectId(valor);
  throw new Error(`El valor de "${campo}" no es un ObjectId válido: ${valor}`);
}

/**
 * Normaliza un documento recibido de la capa externa:
 *  - campos *_id (string) -> ObjectId
 *  - campos que empiezan con "fecha" (string) -> Date
 * Se aplica de forma recursiva a subdocumentos y arreglos.
 */
export function normalizar(valor, clave = '') {
  if (Array.isArray(valor)) return valor.map((v) => normalizar(v, clave));
  if (valor && typeof valor === 'object' && !(valor instanceof ObjectId) && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v, k)]));
  }
  if (typeof valor === 'string') {
    if ((clave.endsWith('_id') || clave === 'profesional_id') && /^[0-9a-fA-F]{24}$/.test(valor)) return new ObjectId(valor);
    if ((clave.startsWith('fecha') || clave === 'hora') && !Number.isNaN(Date.parse(valor))) return new Date(valor);
  }
  return valor;
}
