const fs = require('fs');
const path = require('path');

/**
 * Base de datos JSON local para mapear IDs de Lat-Team con InfoHashes
 */
class TorrentDatabase {
  constructor(filePath = './data/torrents.json') {
    this.filePath = filePath;
    this.data = { torrents: {} };
    this.hashIndex = new Map(); // Índice inverso: hash -> latamId (O(1) lookups)
    this.ensureDataDirectory();
    this.load();
  }

  /**
   * Asegurar que el directorio de datos existe
   */
  ensureDataDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Directorio creado: ${dir}`);
    }
  }

  /**
   * Cargar base de datos desde archivo
   */
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(fileContent);
        
        // Reconstruir índice hash
        this.rebuildHashIndex();
        
        console.log(`✅ Base de datos cargada: ${Object.keys(this.data.torrents).length} torrents`);
      } else {
        console.log(`📝 Base de datos nueva creada`);
        this.save();
      }
    } catch (error) {
      console.error(`❌ Error cargando base de datos: ${error.message}`);
      this.data = { torrents: {} };
      this.hashIndex.clear();
    }
  }

  /**
   * Reconstruir índice de hashes desde los datos
   */
  rebuildHashIndex() {
    this.hashIndex.clear();
    for (const [latamId, torrent] of Object.entries(this.data.torrents)) {
      if (torrent.infoHash) {
        this.hashIndex.set(torrent.infoHash, latamId);
      }
    }
    console.log(`🔍 Índice hash reconstruido: ${this.hashIndex.size} entradas`);
  }

  /**
   * Guardar base de datos a archivo
   */
  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
      console.log(`💾 Base de datos guardada: ${Object.keys(this.data.torrents).length} torrents`);
    } catch (error) {
      console.error(`❌ Error guardando base de datos: ${error.message}`);
    }
  }

  /**
   * Obtener información de un torrent por ID de Lat-Team
   */
  get(latamId) {
    const id = latamId.toString();
    return this.data.torrents[id] || null;
  }

  /**
   * Guardar información de un torrent
   */
  set(latamId, torrentInfo) {
    const id = latamId.toString();
    this.data.torrents[id] = {
      ...torrentInfo,
      updatedAt: new Date().toISOString()
    };
    
    // Actualizar índice hash
    if (torrentInfo.infoHash) {
      this.hashIndex.set(torrentInfo.infoHash, id);
    }
    
    this.save();
    console.log(`✅ Torrent guardado en DB: ID=${id}, Hash=${torrentInfo.infoHash?.substring(0, 8)}...`);
  }

  /**
   * Buscar torrent por infoHash (O(1) con índice)
   */
  getByHash(infoHash) {
    const latamId = this.hashIndex.get(infoHash);
    if (!latamId) return null;
    
    const torrent = this.data.torrents[latamId];
    if (!torrent) return null;
    
    return { latamId, ...torrent };
  }

  /**
   * Verificar si existe un torrent por ID
   */
  exists(latamId) {
    return this.data.torrents.hasOwnProperty(latamId.toString());
  }

  /**
   * Eliminar un torrent de la base de datos
   */
  delete(latamId) {
    const id = latamId.toString();
    const torrent = this.data.torrents[id];
    
    if (torrent) {
      // Eliminar del índice hash
      if (torrent.infoHash) {
        this.hashIndex.delete(torrent.infoHash);
      }
      
      delete this.data.torrents[id];
      this.save();
      console.log(`🗑️  Torrent eliminado de DB: ID=${id}`);
      return true;
    }
    return false;
  }

  /**
   * Obtener estadísticas de la base de datos
   */
  stats() {
    const torrents = Object.values(this.data.torrents);
    const movies = torrents.filter(t => t.type === 'movie').length;
    const series = torrents.filter(t => t.type === 'series').length;
    
    return {
      total: torrents.length,
      movies,
      series,
      oldestEntry: torrents.length > 0 
        ? torrents.reduce((oldest, t) => 
            new Date(t.addedAt) < new Date(oldest.addedAt) ? t : oldest
          ).addedAt
        : null
    };
  }

  /**
   * Limpiar entradas antiguas (opcional)
   */
  cleanup(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    let removed = 0;
    for (const [id, torrent] of Object.entries(this.data.torrents)) {
      if (new Date(torrent.addedAt) < cutoffDate) {
        delete this.data.torrents[id];
        removed++;
      }
    }
    
    if (removed > 0) {
      this.save();
      console.log(`🧹 Limpieza: ${removed} torrents antiguos eliminados`);
    }
    
    return removed;
  }
}

// Exportar instancia única
module.exports = new TorrentDatabase();
