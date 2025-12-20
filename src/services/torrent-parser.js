const crypto = require('crypto');
const axios = require('axios');

/**
 * Decodificador Bencode simple (sin dependencias)
 */
class BencodeDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.index = 0;
  }

  decode() {
    const char = String.fromCharCode(this.buffer[this.index]);
    
    if (char === 'i') {
      return this.decodeInteger();
    } else if (char === 'l') {
      return this.decodeList();
    } else if (char === 'd') {
      return this.decodeDictionary();
    } else if (char >= '0' && char <= '9') {
      return this.decodeString();
    }
    
    throw new Error(`Invalid bencode at position ${this.index}`);
  }

  decodeInteger() {
    this.index++; // skip 'i'
    let end = this.index;
    while (String.fromCharCode(this.buffer[end]) !== 'e') {
      end++;
    }
    const value = parseInt(this.buffer.slice(this.index, end).toString('ascii'));
    this.index = end + 1;
    return value;
  }

  decodeString() {
    let colonIndex = this.index;
    while (String.fromCharCode(this.buffer[colonIndex]) !== ':') {
      colonIndex++;
    }
    const length = parseInt(this.buffer.slice(this.index, colonIndex).toString('ascii'));
    this.index = colonIndex + 1;
    const value = this.buffer.slice(this.index, this.index + length);
    this.index += length;
    return value;
  }

  decodeList() {
    this.index++; // skip 'l'
    const list = [];
    while (String.fromCharCode(this.buffer[this.index]) !== 'e') {
      list.push(this.decode());
    }
    this.index++; // skip 'e'
    return list;
  }

  decodeDictionary() {
    this.index++; // skip 'd'
    const dict = {};
    while (String.fromCharCode(this.buffer[this.index]) !== 'e') {
      const key = this.decodeString().toString('utf8');
      const value = this.decode();
      dict[key] = value;
    }
    this.index++; // skip 'e'
    return dict;
  }
}

/**
 * Encodificar diccionario a bencode
 */
function encodeDictionary(dict) {
  const parts = [Buffer.from('d')];
  
  const keys = Object.keys(dict).sort();
  for (const key of keys) {
    // Encode key
    parts.push(Buffer.from(`${Buffer.byteLength(key)}:`));
    parts.push(Buffer.from(key));
    
    // Encode value
    parts.push(encodeValue(dict[key]));
  }
  
  parts.push(Buffer.from('e'));
  return Buffer.concat(parts);
}

function encodeValue(value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([
      Buffer.from(`${value.length}:`),
      value
    ]);
  } else if (typeof value === 'number') {
    return Buffer.from(`i${value}e`);
  } else if (Array.isArray(value)) {
    const parts = [Buffer.from('l')];
    for (const item of value) {
      parts.push(encodeValue(item));
    }
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  } else if (typeof value === 'object') {
    return encodeDictionary(value);
  }
  throw new Error('Unknown type to encode');
}

/**
 * Calcular InfoHash de un torrent
 */
function calculateInfoHash(torrentData) {
  const decoder = new BencodeDecoder(torrentData);
  const decoded = decoder.decode();
  const infoEncoded = encodeDictionary(decoded.info);
  return crypto.createHash('sha1').update(infoEncoded).digest('hex').toLowerCase();
}

/**
 * Obtener información básica del torrent
 */
function parseTorrentData(torrentData) {
  try {
    const decoder = new BencodeDecoder(torrentData);
    const decoded = decoder.decode();
    
    const info = {
      infoHash: calculateInfoHash(torrentData),
      name: decoded.info.name ? decoded.info.name.toString('utf8') : 'Unknown',
      length: 0,
      files: 0,
      announce: decoded.announce ? decoded.announce.toString('utf8') : null
    };
    
    // Calcular tamaño total
    if (decoded.info.files) {
      // Multi-file torrent
      info.files = decoded.info.files.length;
      info.length = decoded.info.files.reduce((sum, file) => sum + file.length, 0);
    } else if (decoded.info.length) {
      // Single-file torrent
      info.files = 1;
      info.length = decoded.info.length;
    }
    
    return info;
  } catch (error) {
    throw new Error(`Error parseando torrent: ${error.message}`);
  }
}

/**
 * Obtener infoHash de un torrent desde URL
 */
async function getTorrentHashFromUrl(url) {
  console.log(`\n🔍 [getTorrentHash] Descargando torrent...`);
  console.log(`   URL: ${url.substring(0, 60)}...`);
  
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: Error descargando torrent`);
    }
    
    const buffer = Buffer.from(response.data);
    console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    const infoHash = calculateInfoHash(buffer);
    
    console.log(`   ✅ InfoHash: ${infoHash}`);
    
    return infoHash;
  } catch (error) {
    console.error(`   ❌ Error obteniendo hash: ${error.message}`);
    throw error;
  }
}

/**
 * Obtener información completa del torrent
 */
async function getTorrentInfo(url) {
  console.log(`\n📋 [getTorrentInfo] Obteniendo información completa...`);
  console.log(`   URL: ${url.substring(0, 60)}...`);
  
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: Error descargando torrent`);
    }
    
    const buffer = Buffer.from(response.data);
    const info = parseTorrentData(buffer);
    
    console.log(`   ✅ Hash: ${info.infoHash}`);
    console.log(`   Nombre: ${info.name}`);
    console.log(`   Tamaño: ${(info.length / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`   Archivos: ${info.files}`);
    
    return info;
  } catch (error) {
    console.error(`   ❌ Error obteniendo info: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getTorrentHashFromUrl,
  getTorrentInfo
};
