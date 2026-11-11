# Sistema de gestión de pacientes – CCSS (MongoDB)

Capa de datos del sistema de gestión de pacientes para los hospitales de la CCSS.
Proyecto final del curso **Bases de datos NoSQL (SC-609)**, Universidad Fidélitas – **Avance 2**.

- Base de datos: **MongoDB 7** (modelo documental, 10 colecciones + GridFS)
- Lenguaje: **JavaScript (Node.js ≥ 18)** con el driver oficial `mongodb`
- Diagrama del modelo: [`docs/diagrama_colecciones.png`](docs/diagrama_colecciones.png)
- Diccionario de datos: [`docs/diccionario_datos.md`](docs/diccionario_datos.md)

## Estructura

```
├── database/
│   ├── schemas.js      Validadores $jsonSchema e índices de las 10 colecciones
│   ├── setup.js        Crea colecciones, validadores e índices (idempotente)
│   ├── seed.js         Datos de prueba ficticios (por defecto 200 pacientes, ~1000 consultas)
│   └── vistas.js       7 vistas (db.createView)
├── src/
│   ├── config/db.js            Conexión segura (singleton, variables de entorno, TLS, pool)
│   ├── crud/                   CRUD de las colecciones principales
│   ├── procedimientos/         "Procedimientos almacenados" con transacciones
│   ├── funciones/              Funciones de aplicación y función de servidor ($function)
│   ├── cursores/               Recorrido por lotes, paginación, exportación CSV, change streams
│   └── utils/                  Conversión de ids/fechas y hash de contraseñas (scrypt)
├── scripts/            Demostraciones (demo_*.js), pruebas automáticas y generador del diccionario
└── docs/
```

## Requisitos e instalación

1. Node.js 18 o superior y un MongoDB **como replica set** (las transacciones lo exigen).
   Para desarrollo local basta un nodo: `mongod --replSet rs0 --dbpath ./data` y, una sola vez,
   `rs.initiate()` en `mongosh`. También sirve un clúster gratuito de MongoDB Atlas.
2. Instalar dependencias y configurar el entorno:

```bash
npm install
cp .env.example .env      # complete MONGODB_URI y MONGODB_DB (el archivo .env NO se sube a GitHub)
npm run db:ping           # verifica la conexión
npm run db:init           # crea colecciones + índices, carga datos de prueba y crea las vistas
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:ping` | Prueba la conexión |
| `npm run db:setup` | Crea/actualiza colecciones, validadores e índices |
| `npm run db:seed` | Inserta datos de prueba (**borra** el contenido previo) |
| `npm run db:vistas` | Crea las vistas |
| `npm run db:diccionario` | Regenera `docs/diccionario_datos.md` desde la base de datos |
| `npm run demo:crud` | Demostración de CRUD |
| `npm run demo:procedimientos` | Demostración de procedimientos y rollback |
| `npm run demo:funciones` | Demostración de funciones |
| `npm run demo:cursores` | Demostración de cursores |
| `npm run demo:vistas` | Muestra datos de cada vista |
| `npm test` | 15 pruebas automáticas |

## Equivalencias con los conceptos de bases de datos relacionales

El enunciado habla de procedimientos almacenados, vistas, funciones, cursores y diccionario de datos
(conceptos de SQL/PL-SQL). MongoDB los cubre así:

| Concepto | Implementación en este proyecto |
|---|---|
| Tablas | Colecciones con validación `$jsonSchema` (`database/schemas.js`) |
| Procedimientos almacenados | `src/procedimientos/`: operaciones con parámetros de entrada/salida dentro de una transacción multi-documento (ACID) |
| Vistas | `database/vistas.js`: `db.createView` sobre pipelines de agregación (solo lectura) |
| Funciones | `src/funciones/`: funciones de cálculo y `$function` (JavaScript ejecutado en el servidor) |
| Cursores | `src/cursores/`: cursores de `find`/`aggregate` con `batchSize`, paginación por keyset, streaming a CSV y *change streams* |
| Diccionario de datos | `docs/diccionario_datos.md`, generado a partir de los validadores reales |

## Procedimientos

| Procedimiento | Descripción |
|---|---|
| `registrarConsulta` | Guarda consulta + prescripción + exámenes + bitácora en una transacción; bloquea medicamentos a los que el paciente es alérgico |
| `consultarExpediente` | Devuelve el expediente completo y registra la lectura en la bitácora |
| `registrarCirugiaRealizada` | Cierra una cirugía programada y agrega su ruta quirúrgica |
| `crearUsuarioProfesional` | Crea la cuenta (con hash) de un profesional existente |
| `desactivarPaciente` | Borrado lógico + bitácora |
| `finalizarPrescripcionesVencidas` | Proceso por lotes que finaliza recetas vencidas |

## Seguridad

- Credenciales solo en `.env` (ignorado por Git); conexión con TLS configurable y tiempo de espera acotado.
- Crear un usuario de aplicación con privilegios mínimos en lugar de usar el administrador:

```js
// mongosh, con una cuenta administradora
use ccss_pacientes
db.createUser({ user: 'app_ccss', pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'ccss_pacientes' }] })
```

- Contraseñas con `scrypt` + sal; el hash nunca se devuelve en las lecturas.
- Bitácora de solo inserción; expedientes con borrado lógico.
- Cada colección valida su estructura en el servidor (`validationAction: error`).

## Autoría

Elaborado por Gabriel Vega Maroto para el curso SC-609 (Grupo GV). Datos de prueba ficticios.
