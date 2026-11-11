// Fábrica de repositorios CRUD genéricos sobre una colección de MongoDB.
import { conectar } from '../config/db.js';
import { aObjectId, normalizar } from '../utils/ids.js';

/**
 * @param {string} nombre  nombre de la colección
 * @param {object} opciones
 *   - proyeccion: campos a ocultar en lecturas (ej. { password_hash: 0 })
 *   - antesDeCrear(doc): hook para completar/transformar el documento
 *   - permitirEliminar: false para colecciones inmutables o con borrado lógico
 *   - permitirActualizar: false para colecciones de solo inserción (bitácora)
 */
export function crearRepositorio(nombre, { proyeccion = {}, antesDeCrear = (d) => d, permitirEliminar = true, permitirActualizar = true } = {}) {
  const col = async () => (await conectar()).collection(nombre);

  return {
    nombre,
    coleccion: col,

    /** CREATE: inserta y devuelve el documento con su _id. La validación $jsonSchema la hace el servidor. */
    async crear(datos) {
      const doc = antesDeCrear(normalizar(datos));
      const { insertedId } = await (await col()).insertOne(doc);
      return { _id: insertedId, ...doc };
    },

    /** READ (uno): por _id. Devuelve null si no existe. */
    async obtenerPorId(id) {
      return (await col()).findOne({ _id: aObjectId(id) }, { projection: proyeccion });
    },

    /** READ (varios): filtro + paginación + orden. Devuelve { datos, total, pagina, tamano }. */
    async listar(filtro = {}, { pagina = 1, tamano = 20, orden = { _id: 1 } } = {}) {
      const c = await col();
      const f = normalizar(filtro);
      const tam = Math.min(Math.max(Number(tamano) || 20, 1), 200); // tope para proteger el servidor
      const pag = Math.max(Number(pagina) || 1, 1);
      const [datos, total] = await Promise.all([
        c.find(f, { projection: proyeccion }).sort(orden).skip((pag - 1) * tam).limit(tam).toArray(),
        c.countDocuments(f)
      ]);
      return { datos, total, pagina: pag, tamano: tam };
    },

    /** UPDATE: aplica $set solo con los campos recibidos y devuelve el documento actualizado. */
    async actualizar(id, cambios) {
      if (!permitirActualizar) throw new Error(`La colección ${nombre} es de solo inserción.`);
      const set = normalizar(cambios);
      delete set._id;
      if (Object.keys(set).length === 0) throw new Error('No se recibieron campos para actualizar.');
      return (await col()).findOneAndUpdate({ _id: aObjectId(id) }, { $set: set }, { returnDocument: 'after', projection: proyeccion });
    },

    /** DELETE: elimina por _id. Devuelve true si se eliminó un documento. */
    async eliminar(id) {
      if (!permitirEliminar) throw new Error(`En ${nombre} no se eliminan documentos (use el borrado lógico o la política de retención).`);
      const r = await (await col()).deleteOne({ _id: aObjectId(id) });
      return r.deletedCount === 1;
    }
  };
}
