// Hash de contraseñas con scrypt (módulo crypto de Node, sin dependencias externas).
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(password, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

export function verificarPassword(password, almacenado) {
  const [sal, hash] = String(almacenado).split(':');
  if (!sal || !hash) return false;
  const calculado = scryptSync(password, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
