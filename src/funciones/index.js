import { Code } from 'mongodb';

// FUNCIONES del sistema.
//  A) Funciones de la aplicación (JavaScript): reciben parámetros y devuelven un valor.
//  B) Función ejecutada DENTRO del servidor con el operador $function de la agregación.

/** Edad en años cumplidos a una fecha dada (por defecto hoy). */
export function calcularEdad(fechaNacimiento, hoy = new Date()) {
  const n = new Date(fechaNacimiento);
  if (Number.isNaN(n.getTime())) throw new Error('Fecha de nacimiento inválida.');
  let edad = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
  return edad;
}

/** Índice de masa corporal = peso (kg) / talla² (m). */
export function calcularIMC(pesoKg, tallaM) {
  if (!(pesoKg > 0) || !(tallaM > 0)) throw new Error('Peso y talla deben ser mayores que cero.');
  return Math.round((pesoKg / (tallaM * tallaM)) * 10) / 10;
}

/** Clasificación de la OMS para adultos según el IMC. */
export function clasificarIMC(imc) {
  if (imc < 18.5) return 'Bajo peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidad';
}

/** Compara un valor de laboratorio contra su rango de referencia: 'bajo' | 'normal' | 'alto'. */
export function interpretarResultado(valor, rango) {
  if (!rango) return 'sin_rango';
  if (valor < rango.min) return 'bajo';
  if (valor > rango.max) return 'alto';
  return 'normal';
}

/** Clasifica la presión arterial "sistólica/diastólica" (categorías simplificadas). */
export function clasificarPresion(pa) {
  const m = /^(\d{2,3})\/(\d{2,3})$/.exec(pa);
  if (!m) throw new Error('Formato de presión inválido; use "120/80".');
  const [s, d] = [Number(m[1]), Number(m[2])];
  if (s >= 140 || d >= 90) return 'Hipertensión';
  if (s >= 130 || d >= 80) return 'Elevada';
  return 'Normal';
}

/** Valida el formato de una cédula (9 a 12 dígitos). */
export function validarCedula(cedula) {
  return /^[0-9]{9,12}$/.test(String(cedula));
}

// ---------- B) Función del lado del servidor ($function) ----------
/**
 * Etapa de agregación que agrega "grupo_etario" a cada paciente calculándolo
 * dentro del servidor MongoDB con JavaScript ($function).
 */
export function etapaGrupoEtario() {
  return {
    $addFields: {
      grupo_etario: {
        $function: {
          body: new Code(function (fechaNac) {
            var anios = Math.floor((Date.now() - fechaNac.getTime()) / 31557600000);
            if (anios < 12) return 'Niñez';
            if (anios < 18) return 'Adolescencia';
            if (anios < 65) return 'Adultez';
            return 'Persona adulta mayor';
          }.toString()),
          args: ['$fecha_nacimiento'],
          lang: 'js'
        }
      }
    }
  };
}
