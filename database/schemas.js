// Esquemas de validación ($jsonSchema) e índices de las 10 colecciones del diseño (Avance 1).
// Este archivo es la fuente única del diccionario de datos.
const oid = { bsonType: 'objectId' };
const str = (descripcion, extra = {}) => ({ bsonType: 'string', description: descripcion, ...extra });
const fecha = (descripcion) => ({ bsonType: 'date', description: descripcion });

export const colecciones = {
  centros_salud: {
    descripcion: 'Hospitales, clínicas y EBAIS con ubicación geográfica y servicios.',
    validator: {
      bsonType: 'object',
      required: ['codigo', 'nombre', 'tipo', 'ubicacion'],
      properties: {
        codigo: str('Código único del centro (ej. HSJD)'),
        nombre: str('Nombre oficial del centro', { minLength: 3 }),
        tipo: { enum: ['hospital', 'clinica', 'ebais'], description: 'Tipo de establecimiento' },
        ubicacion: {
          bsonType: 'object', required: ['type', 'coordinates'],
          description: 'Punto GeoJSON [longitud, latitud]',
          properties: { type: { enum: ['Point'] }, coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: ['double', 'int'] } } }
        },
        servicios: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Servicios ofrecidos' }
      }
    },
    indices: [
      { key: { codigo: 1 }, options: { unique: true, name: 'ux_codigo' } },
      { key: { ubicacion: '2dsphere' }, options: { name: 'ix_ubicacion' } }
    ]
  },

  profesionales: {
    descripcion: 'Personal de salud con especialidad y código profesional.',
    validator: {
      bsonType: 'object',
      required: ['cedula', 'nombre', 'especialidad', 'codigo_profesional', 'centro_id'],
      properties: {
        cedula: str('Cédula del profesional', { pattern: '^[0-9]{9,12}$' }),
        nombre: str('Nombre completo'),
        especialidad: str('Especialidad médica'),
        codigo_profesional: str('Código del colegio profesional (ej. MED-12345)'),
        centro_id: { ...oid, description: 'FK -> centros_salud' }
      }
    },
    indices: [
      { key: { cedula: 1 }, options: { unique: true, name: 'ux_cedula' } },
      { key: { codigo_profesional: 1 }, options: { unique: true, name: 'ux_codigo_profesional' } },
      { key: { centro_id: 1 }, options: { name: 'ix_centro' } }
    ]
  },

  usuarios: {
    descripcion: 'Cuentas de acceso con rol y estado.',
    validator: {
      bsonType: 'object',
      required: ['username', 'password_hash', 'rol', 'centro_id', 'activo'],
      properties: {
        username: str('Nombre de usuario único', { minLength: 4 }),
        password_hash: str('Hash scrypt de la contraseña (formato salt:hash). Nunca se guarda en texto plano'),
        rol: { enum: ['medico', 'enfermeria', 'laboratorio', 'admin', 'analista'], description: 'Rol de la aplicación' },
        profesional_id: { ...oid, description: 'FK 1:1 -> profesionales (opcional para admin/analista)' },
        centro_id: { ...oid, description: 'FK -> centros_salud' },
        activo: { bsonType: 'bool', description: 'Cuenta habilitada' }
      }
    },
    indices: [
      { key: { username: 1 }, options: { unique: true, name: 'ux_username' } },
      { key: { profesional_id: 1 }, options: { unique: true, partialFilterExpression: { profesional_id: { $type: 'objectId' } }, name: 'ux_profesional' } }
    ]
  },

  pacientes: {
    descripcion: 'Datos demográficos, antecedentes, alergias y contactos de emergencia.',
    validator: {
      bsonType: 'object',
      required: ['cedula', 'nombre', 'apellidos', 'fecha_nacimiento', 'sexo', 'activo'],
      properties: {
        cedula: str('Cédula del paciente (única)', { pattern: '^[0-9]{9,12}$' }),
        nombre: str('Nombre'),
        apellidos: str('Apellidos'),
        fecha_nacimiento: fecha('Fecha de nacimiento'),
        sexo: { enum: ['F', 'M', 'O'], description: 'Sexo registrado' },
        contacto: { bsonType: 'object', properties: { telefono: str('Teléfono'), correo: str('Correo electrónico') } },
        direccion: { bsonType: 'object', properties: { provincia: str('Provincia'), canton: str('Cantón'), distrito: str('Distrito') } },
        alergias: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Alergias conocidas' },
        antecedentes: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Antecedentes personales/familiares' },
        contactos_emergencia: {
          bsonType: 'array', description: 'Personas a contactar en emergencias',
          items: { bsonType: 'object', required: ['nombre', 'telefono'], properties: { nombre: str('Nombre'), parentesco: str('Parentesco'), telefono: str('Teléfono') } }
        },
        activo: { bsonType: 'bool', description: 'Borrado lógico: false = expediente inactivo (no se elimina)' }
      }
    },
    indices: [
      { key: { cedula: 1 }, options: { unique: true, name: 'ux_cedula' } },
      { key: { apellidos: 1, nombre: 1 }, options: { name: 'ix_nombre' } }
    ]
  },

  consultas: {
    descripcion: 'Registro de cada visita: motivo, signos vitales, diagnósticos CIE-10 y comentarios.',
    validator: {
      bsonType: 'object',
      required: ['paciente_id', 'profesional_id', 'centro_id', 'fecha', 'motivo'],
      properties: {
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        profesional_id: { ...oid, description: 'FK -> profesionales' },
        centro_id: { ...oid, description: 'FK -> centros_salud' },
        fecha: fecha('Fecha y hora de la consulta'),
        motivo: str('Motivo de consulta'),
        signos_vitales: {
          bsonType: 'object', description: 'Signos vitales embebidos',
          properties: {
            pa: str('Presión arterial sistólica/diastólica', { pattern: '^[0-9]{2,3}/[0-9]{2,3}$' }),
            fc: { bsonType: ['int', 'long', 'double'], minimum: 20, maximum: 250, description: 'Frecuencia cardíaca (lpm)' },
            temp: { bsonType: ['double', 'int'], minimum: 30, maximum: 45, description: 'Temperatura (°C)' },
            peso: { bsonType: ['double', 'int'], minimum: 0.5, maximum: 500, description: 'Peso (kg)' },
            talla: { bsonType: ['double', 'int'], minimum: 0.3, maximum: 2.5, description: 'Talla (m)' }
          }
        },
        diagnosticos: {
          bsonType: 'array', description: 'Diagnósticos CIE-10',
          items: { bsonType: 'object', required: ['cie10', 'descripcion'], properties: { cie10: str('Código CIE-10', { pattern: '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$' }), descripcion: str('Descripción') } }
        },
        comentarios_medico: str('Texto libre del médico')
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { centro_id: 1, fecha: -1 }, options: { name: 'ix_centro_fecha' } },
      { key: { 'diagnosticos.cie10': 1 }, options: { name: 'ix_cie10' } }
    ]
  },

  prescripciones: {
    descripcion: 'Medicamentos recetados en una consulta.',
    validator: {
      bsonType: 'object',
      required: ['consulta_id', 'paciente_id', 'profesional_id', 'fecha', 'estado', 'medicamentos'],
      properties: {
        consulta_id: { ...oid, description: 'FK -> consultas' },
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        profesional_id: { ...oid, description: 'FK -> profesionales' },
        fecha: fecha('Fecha de la receta'),
        estado: { enum: ['activa', 'finalizada'], description: 'Estado de la prescripción' },
        medicamentos: {
          bsonType: 'array', minItems: 1, description: 'Medicamentos embebidos',
          items: { bsonType: 'object', required: ['nombre', 'dosis', 'frecuencia', 'dias'], properties: { nombre: str('Nombre'), dosis: str('Dosis'), frecuencia: str('Frecuencia'), dias: { bsonType: ['int', 'long'], minimum: 1, description: 'Duración en días' } } }
        }
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { consulta_id: 1 }, options: { name: 'ix_consulta' } },
      { key: { 'medicamentos.nombre': 1 }, options: { name: 'ix_medicamento' } }
    ]
  },

  examenes_laboratorio: {
    descripcion: 'Pruebas de laboratorio y sus resultados por parámetro.',
    validator: {
      bsonType: 'object',
      required: ['paciente_id', 'consulta_id', 'tipo', 'fecha', 'resultados'],
      properties: {
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        consulta_id: { ...oid, description: 'FK -> consultas' },
        tipo: str('Tipo de examen (ej. Hemograma)'),
        fecha: fecha('Fecha del examen'),
        resultados: {
          bsonType: 'array', minItems: 1, description: 'Resultados embebidos',
          items: {
            bsonType: 'object', required: ['parametro', 'valor'],
            properties: {
              parametro: str('Parámetro medido'),
              valor: { bsonType: ['double', 'int', 'long'], description: 'Valor numérico' },
              unidad: str('Unidad'),
              rango: { bsonType: 'object', properties: { min: { bsonType: ['double', 'int'] }, max: { bsonType: ['double', 'int'] } }, description: 'Rango de referencia' }
            }
          }
        }
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { consulta_id: 1 }, options: { name: 'ix_consulta' } }
    ]
  },

  imagenes_medicas: {
    descripcion: 'Metadatos e informe de rayos X, ecografías y electrocardiogramas. El archivo vive en GridFS.',
    validator: {
      bsonType: 'object',
      required: ['paciente_id', 'consulta_id', 'tipo', 'fecha'],
      properties: {
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        consulta_id: { ...oid, description: 'FK -> consultas' },
        tipo: { enum: ['rayosX', 'ecografia', 'ECG'], description: 'Tipo de imagen' },
        archivo_id: { ...oid, description: 'Id del archivo en GridFS (bucket "imagenes")' },
        metadatos: { bsonType: 'object', properties: { formato: str('Formato (DICOM, JPG, PDF)'), tamano: { bsonType: ['int', 'long'], minimum: 0, description: 'Bytes' }, equipo: str('Equipo utilizado') } },
        informe: str('Informe radiológico (texto libre)'),
        fecha: fecha('Fecha de la imagen')
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { consulta_id: 1 }, options: { name: 'ix_consulta' } }
    ]
  },

  cirugias: {
    descripcion: 'Procedimientos quirúrgicos, equipo y ruta quirúrgica.',
    validator: {
      bsonType: 'object',
      required: ['paciente_id', 'centro_id', 'procedimiento', 'estado', 'fecha'],
      properties: {
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        centro_id: { ...oid, description: 'FK -> centros_salud' },
        procedimiento: str('Nombre del procedimiento'),
        fecha: fecha('Fecha programada o realizada'),
        equipo: { bsonType: 'array', description: 'Equipo quirúrgico', items: { bsonType: 'object', required: ['profesional_id', 'rol'], properties: { profesional_id: oid, rol: str('Rol en la cirugía') } } },
        ruta_quirurgica: { bsonType: 'array', description: 'Etapas de la ruta quirúrgica', items: { bsonType: 'object', required: ['etapa'], properties: { etapa: str('Etapa'), hora: fecha('Hora de la etapa') } } },
        estado: { enum: ['programada', 'realizada'], description: 'Estado de la cirugía' }
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { centro_id: 1, fecha: -1 }, options: { name: 'ix_centro_fecha' } }
    ]
  },

  bitacora_accesos: {
    descripcion: 'Auditoría de lecturas, escrituras y exportaciones sobre expedientes. Solo se inserta.',
    validator: {
      bsonType: 'object',
      required: ['usuario_id', 'paciente_id', 'accion', 'fecha'],
      properties: {
        usuario_id: { ...oid, description: 'FK -> usuarios' },
        paciente_id: { ...oid, description: 'FK -> pacientes' },
        accion: { enum: ['lectura', 'escritura', 'exportacion'], description: 'Acción realizada' },
        fecha: fecha('Momento del acceso'),
        ip: str('Dirección IP de origen')
      }
    },
    indices: [
      { key: { paciente_id: 1, fecha: -1 }, options: { name: 'ix_paciente_fecha' } },
      { key: { usuario_id: 1, fecha: -1 }, options: { name: 'ix_usuario_fecha' } }
    ]
  }
};
