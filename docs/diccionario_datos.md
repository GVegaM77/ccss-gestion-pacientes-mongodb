# Diccionario de datos

_Generado automáticamente con `npm run db:diccionario` a partir de los validadores `$jsonSchema` de MongoDB._

## Colecciones

### centros_salud

Hospitales, clínicas y EBAIS con ubicación geográfica y servicios.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| codigo | string | Sí | Código único del centro (ej. HSJD) |
| nombre | string | Sí | Nombre oficial del centro |
| tipo | enum {hospital, clinica, ebais} | Sí | Tipo de establecimiento |
| ubicacion | object | Sí | Punto GeoJSON [longitud, latitud] |
| ubicacion.type | enum {Point} | Sí |  |
| ubicacion.coordinates | array | Sí |  |
| servicios | array | No | Servicios ofrecidos |

**Índices:** `ux_codigo` {"codigo":1} (único); `ix_ubicacion` {"ubicacion":"2dsphere"}

### profesionales

Personal de salud con especialidad y código profesional.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| cedula | string /^[0-9]{9,12}$/ | Sí | Cédula del profesional |
| nombre | string | Sí | Nombre completo |
| especialidad | string | Sí | Especialidad médica |
| codigo_profesional | string | Sí | Código del colegio profesional (ej. MED-12345) |
| centro_id | objectId | Sí | FK -> centros_salud |

**Índices:** `ux_cedula` {"cedula":1} (único); `ux_codigo_profesional` {"codigo_profesional":1} (único); `ix_centro` {"centro_id":1}

### usuarios

Cuentas de acceso con rol y estado.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| username | string | Sí | Nombre de usuario único |
| password_hash | string | Sí | Hash scrypt de la contraseña (formato salt:hash). Nunca se guarda en texto plano |
| rol | enum {medico, enfermeria, laboratorio, admin, analista} | Sí | Rol de la aplicación |
| profesional_id | objectId | No | FK 1:1 -> profesionales (opcional para admin/analista) |
| centro_id | objectId | Sí | FK -> centros_salud |
| activo | bool | Sí | Cuenta habilitada |

**Índices:** `ux_username` {"username":1} (único); `ux_profesional` {"profesional_id":1} (único)

### pacientes

Datos demográficos, antecedentes, alergias y contactos de emergencia.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| cedula | string /^[0-9]{9,12}$/ | Sí | Cédula del paciente (única) |
| nombre | string | Sí | Nombre |
| apellidos | string | Sí | Apellidos |
| fecha_nacimiento | date | Sí | Fecha de nacimiento |
| sexo | enum {F, M, O} | Sí | Sexo registrado |
| contacto | object | No |  |
| contacto.telefono | string | No | Teléfono |
| contacto.correo | string | No | Correo electrónico |
| direccion | object | No |  |
| direccion.provincia | string | No | Provincia |
| direccion.canton | string | No | Cantón |
| direccion.distrito | string | No | Distrito |
| alergias | array | No | Alergias conocidas |
| antecedentes | array | No | Antecedentes personales/familiares |
| contactos_emergencia | array | No | Personas a contactar en emergencias |
| contactos_emergencia[].nombre | string | Sí | Nombre |
| contactos_emergencia[].parentesco | string | No | Parentesco |
| contactos_emergencia[].telefono | string | Sí | Teléfono |
| activo | bool | Sí | Borrado lógico: false = expediente inactivo (no se elimina) |

**Índices:** `ux_cedula` {"cedula":1} (único); `ix_nombre` {"apellidos":1,"nombre":1}

### consultas

Registro de cada visita: motivo, signos vitales, diagnósticos CIE-10 y comentarios.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| paciente_id | objectId | Sí | FK -> pacientes |
| profesional_id | objectId | Sí | FK -> profesionales |
| centro_id | objectId | Sí | FK -> centros_salud |
| fecha | date | Sí | Fecha y hora de la consulta |
| motivo | string | Sí | Motivo de consulta |
| signos_vitales | object | No | Signos vitales embebidos |
| signos_vitales.pa | string /^[0-9]{2,3}/[0-9]{2,3}$/ | No | Presión arterial sistólica/diastólica |
| signos_vitales.fc | int | long | double [20, 250] | No | Frecuencia cardíaca (lpm) |
| signos_vitales.temp | double | int [30, 45] | No | Temperatura (°C) |
| signos_vitales.peso | double | int [0.5, 500] | No | Peso (kg) |
| signos_vitales.talla | double | int [0.3, 2.5] | No | Talla (m) |
| diagnosticos | array | No | Diagnósticos CIE-10 |
| diagnosticos[].cie10 | string /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/ | Sí | Código CIE-10 |
| diagnosticos[].descripcion | string | Sí | Descripción |
| comentarios_medico | string | No | Texto libre del médico |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_centro_fecha` {"centro_id":1,"fecha":-1}; `ix_cie10` {"diagnosticos.cie10":1}

### prescripciones

Medicamentos recetados en una consulta.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| consulta_id | objectId | Sí | FK -> consultas |
| paciente_id | objectId | Sí | FK -> pacientes |
| profesional_id | objectId | Sí | FK -> profesionales |
| fecha | date | Sí | Fecha de la receta |
| estado | enum {activa, finalizada} | Sí | Estado de la prescripción |
| medicamentos | array | Sí | Medicamentos embebidos |
| medicamentos[].nombre | string | Sí | Nombre |
| medicamentos[].dosis | string | Sí | Dosis |
| medicamentos[].frecuencia | string | Sí | Frecuencia |
| medicamentos[].dias | int | long [1, ∞] | Sí | Duración en días |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_consulta` {"consulta_id":1}; `ix_medicamento` {"medicamentos.nombre":1}

### examenes_laboratorio

Pruebas de laboratorio y sus resultados por parámetro.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| paciente_id | objectId | Sí | FK -> pacientes |
| consulta_id | objectId | Sí | FK -> consultas |
| tipo | string | Sí | Tipo de examen (ej. Hemograma) |
| fecha | date | Sí | Fecha del examen |
| resultados | array | Sí | Resultados embebidos |
| resultados[].parametro | string | Sí | Parámetro medido |
| resultados[].valor | double | int | long | Sí | Valor numérico |
| resultados[].unidad | string | No | Unidad |
| resultados[].rango | object | No | Rango de referencia |
| resultados[].rango.min | double | int | No |  |
| resultados[].rango.max | double | int | No |  |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_consulta` {"consulta_id":1}

### imagenes_medicas

Metadatos e informe de rayos X, ecografías y electrocardiogramas. El archivo vive en GridFS.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| paciente_id | objectId | Sí | FK -> pacientes |
| consulta_id | objectId | Sí | FK -> consultas |
| tipo | enum {rayosX, ecografia, ECG} | Sí | Tipo de imagen |
| archivo_id | objectId | No | Id del archivo en GridFS (bucket "imagenes") |
| metadatos | object | No |  |
| metadatos.formato | string | No | Formato (DICOM, JPG, PDF) |
| metadatos.tamano | int | long [0, ∞] | No | Bytes |
| metadatos.equipo | string | No | Equipo utilizado |
| informe | string | No | Informe radiológico (texto libre) |
| fecha | date | Sí | Fecha de la imagen |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_consulta` {"consulta_id":1}

### cirugias

Procedimientos quirúrgicos, equipo y ruta quirúrgica.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| paciente_id | objectId | Sí | FK -> pacientes |
| centro_id | objectId | Sí | FK -> centros_salud |
| procedimiento | string | Sí | Nombre del procedimiento |
| fecha | date | Sí | Fecha programada o realizada |
| equipo | array | No | Equipo quirúrgico |
| equipo[].profesional_id | objectId | Sí |  |
| equipo[].rol | string | Sí | Rol en la cirugía |
| ruta_quirurgica | array | No | Etapas de la ruta quirúrgica |
| ruta_quirurgica[].etapa | string | Sí | Etapa |
| ruta_quirurgica[].hora | date | No | Hora de la etapa |
| estado | enum {programada, realizada} | Sí | Estado de la cirugía |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_centro_fecha` {"centro_id":1,"fecha":-1}

### bitacora_accesos

Auditoría de lecturas, escrituras y exportaciones sobre expedientes. Solo se inserta.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| _id | objectId | Sí | Llave primaria generada por MongoDB |
| usuario_id | objectId | Sí | FK -> usuarios |
| paciente_id | objectId | Sí | FK -> pacientes |
| accion | enum {lectura, escritura, exportacion} | Sí | Acción realizada |
| fecha | date | Sí | Momento del acceso |
| ip | string | No | Dirección IP de origen |

**Índices:** `ix_paciente_fecha` {"paciente_id":1,"fecha":-1}; `ix_usuario_fecha` {"usuario_id":1,"fecha":-1}

## Vistas

| Vista | Colección base | Descripción |
|---|---|---|
| v_historial_paciente | consultas | Historial de consultas con el nombre del profesional y del centro (ya resueltas las referencias). |
| v_expediente_resumen | pacientes | Resumen por paciente: edad, alergias, número de consultas y fecha de la última consulta. |
| v_consultas_por_centro_mes | consultas | Cantidad de consultas por centro de salud y mes (reportería). |
| v_diagnosticos_frecuentes | consultas | Diagnósticos CIE-10 ordenados por frecuencia (detección de patrones). |
| v_medicamentos_mas_recetados | prescripciones | Medicamentos más recetados y número de pacientes distintos. |
| v_resultados_laboratorio_anormales | examenes_laboratorio | Resultados de laboratorio fuera de su rango de referencia, con el nombre del paciente. |
| v_actividad_por_usuario | bitacora_accesos | Auditoría: número de accesos por usuario y tipo de acción. |

## GridFS

| Colección | Descripción |
|---|---|
| imagenes.files | Metadatos de cada archivo de imagen médica almacenado en GridFS |
| imagenes.chunks | Fragmentos binarios (255 KB) de los archivos |
