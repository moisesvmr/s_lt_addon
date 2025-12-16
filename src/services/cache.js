/**
 * Sistema de caché en memoria con expiración automática
 */

class Cache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Obtener URL del caché y reiniciar el contador si existe
   */
  get(key, duration) {
    if (this.cache.has(key)) {
      const { url, timestamp } = this.cache.get(key);
      const now = Date.now();
      
      if ((now - timestamp) / 1000 < duration) {
        console.log(`✓ Cache hit para ${key}`);
        // Reiniciar el contador de 1 hora al acceder
        this.cache.set(key, { url, timestamp: now });
        console.log(`✓ Contador reiniciado: ${key} tiene 1 hora más`);
        return url;
      } else {
        console.log(`✗ Cache expirado para ${key} (sin actividad por 1 hora)`);
        this.cache.delete(key);
      }
    }
    return null;
  }

  /**
   * Guardar URL en caché con timestamp actual
   */
  set(key, url) {
    this.cache.set(key, { url, timestamp: Date.now() });
    console.log(`✓ Guardado en cache: ${key}`);
  }

  /**
   * Eliminar una entrada del caché
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Limpiar todo el caché
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Obtener tamaño del caché
   */
  size() {
    return this.cache.size;
  }
}

module.exports = new Cache();
