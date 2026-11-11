import { conectar, desconectar } from '../src/config/db.js';
import { calcularEdad, calcularIMC, clasificarIMC, clasificarPresion, interpretarResultado, etapaGrupoEtario } from '../src/funciones/index.js';

console.log('calcularEdad("1990-05-17")        ->', calcularEdad('1990-05-17'));
const imc = calcularIMC(72, 1.7);
console.log('calcularIMC(72, 1.70)             ->', imc, clasificarIMC(imc));
console.log('clasificarPresion("135/85")       ->', clasificarPresion('135/85'));
console.log('interpretarResultado(8, 11–17)    ->', interpretarResultado(8, { min: 11, max: 17 }));

const db = await conectar();
const r = await db.collection('pacientes').aggregate([etapaGrupoEtario(), { $group: { _id: '$grupo_etario', pacientes: { $sum: 1 } } }, { $sort: { pacientes: -1 } }]).toArray();
console.log('\n$function ejecutada en el servidor (pacientes por grupo etario):');
console.table(r.map((x) => ({ grupo: x._id, pacientes: x.pacientes })));
await desconectar();
