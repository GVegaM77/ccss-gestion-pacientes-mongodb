// Genera docs/diccionario_datos.md leyendo los validadores $jsonSchema reales de la base de datos
// (así el diccionario nunca queda desactualizado respecto al esquema).
import { writeFile } from 'node:fs/promises';
import { conectar, desconectar } from '../src/config/db.js';
import { colecciones } from '../database/schemas.js';
import { vistas } from '../database/vistas.js';

const db = await conectar();
const infos = await db.listCollections({}, { nameOnly: false }).toArray();
const tipoTexto = (p) => {
  let t = Array.isArray(p.bsonType) ? p.bsonType.join(' | ') : p.bsonType ?? (p.enum ? 'enum' : '');
  if (p.enum) t += ` {${p.enum.join(', ')}}`;
  if (p.pattern) t += ` /${p.pattern}/`;
  if (p.minimum !== undefined || p.maximum !== undefined) t += ` [${p.minimum ?? '−∞'}, ${p.maximum ?? '∞'}]`;
  return t;
};
const filas = (props, requeridos = [], prefijo = '') => Object.entries(props ?? {}).flatMap(([campo, p]) => {
  const fila = `| ${prefijo}${campo} | ${tipoTexto(p)} | ${requeridos.includes(campo) ? 'Sí' : 'No'} | ${p.description ?? ''} |`;
  const hijos = p.bsonType === 'object' ? filas(p.properties, p.required, `${prefijo}${campo}.`)
    : p.bsonType === 'array' && p.items?.bsonType === 'object' ? filas(p.items.properties, p.items.required, `${prefijo}${campo}[].`) : [];
  return [fila, ...hijos];
});

let md = '# Diccionario de datos\n\n_Generado automáticamente con `npm run db:diccionario` a partir de los validadores `$jsonSchema` de MongoDB._\n\n';
md += '## Colecciones\n\n';
for (const [nombre, def] of Object.entries(colecciones)) {
  const real = infos.find((i) => i.name === nombre)?.options?.validator?.$jsonSchema ?? def.validator;
  md += `### ${nombre}\n\n${def.descripcion}\n\n| Campo | Tipo | Obligatorio | Descripción |\n|---|---|---|---|\n| _id | objectId | Sí | Llave primaria generada por MongoDB |\n`;
  md += filas(real.properties, real.required).join('\n') + '\n\n';
  const ixs = await db.collection(nombre).indexes();
  md += '**Índices:** ' + ixs.filter((i) => i.name !== '_id_').map((i) => `\`${i.name}\` ${JSON.stringify(i.key)}${i.unique ? ' (único)' : ''}`).join('; ') + '\n\n';
}
md += '## Vistas\n\n| Vista | Colección base | Descripción |\n|---|---|---|\n';
for (const v of vistas) md += `| ${v.nombre} | ${v.base} | ${v.descripcion} |\n`;
md += '\n## GridFS\n\n| Colección | Descripción |\n|---|---|\n| imagenes.files | Metadatos de cada archivo de imagen médica almacenado en GridFS |\n| imagenes.chunks | Fragmentos binarios (255 KB) de los archivos |\n';
await writeFile(new URL('../docs/diccionario_datos.md', import.meta.url), md);
console.log(`docs/diccionario_datos.md generado (${md.split('\n').length} líneas)`);
await desconectar();
