require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const cors = require('@fastify/cors');
const QBittorrentClient = require('./services/qbittorrent');
const { consultarLatamTmdb } = require('./services/streaming');
const cache = require('./services/cache');
const database = require('./services/database');
const { getTorrentHashFromUrl, getTorrentInfo } = require('./services/torrent-parser');
const { sleep } = require('./utils/helpers');

// Registrar CORS
fastify.register(cors, {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['*']
});

// Variables de entorno
const LATAM_TOKEN = process.env.LATAM_TOKEN;
const TMDB_KEY = process.env.TMDB_KEY;
const ADDON_KEY = process.env.ADDON_KEY;
const DOMAIN = process.env.DOMAIN;
const QBIT_HOST = process.env.QBIT_HOST;
const QBIT_USER = process.env.QBIT_USER;
const QBIT_PASS = process.env.QBIT_PASS;
const TORRENT_API_KEY = process.env.TORRENT_API_KEY;
const TORRENT_MOVIES_PATH = process.env.TORRENT_MOVIES_PATH;
const TORRENT_SERIES_PATH = process.env.TORRENT_SERIES_PATH;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '2');
const STREAM_API_URL = process.env.STREAM_API_URL ;
const STREAM_API_TOKEN = process.env.STREAM_API_TOKEN ;
const STREAM_API_VERIFY_SSL = (process.env.STREAM_API_VERIFY_SSL || 'true').toLowerCase() === 'true';
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION || '3600');
const PORT = parseInt(process.env.PORT || '5000');
const HOST = process.env.HOST || '0.0.0.0';

// Cliente qBittorrent global (reutilizable)
let qbtGlobal = null;
let qbtRetryCount = 0;
const MAX_QB_RETRIES = 3;
const QB_RETRY_DELAY = 2; // segundos

// Obtener o crear cliente qBittorrent con retry automático
async function getQbtClient() {
  if (qbtGlobal) {
    return qbtGlobal;
  }
  
  // Intentar conectar con retry y backoff exponencial
  for (let attempt = 0; attempt < MAX_QB_RETRIES; attempt++) {
    try {
      console.log(`🔌 Conectando a qBittorrent (intento ${attempt + 1}/${MAX_QB_RETRIES})...`);
      qbtGlobal = new QBittorrentClient(QBIT_HOST, QBIT_USER, QBIT_PASS);
      await qbtGlobal.connect();
      qbtRetryCount = 0; // Resetear contador al conectar exitosamente
      console.log(`✅ Cliente qBittorrent conectado`);
      return qbtGlobal;
    } catch (error) {
      console.log(`⚠️  Error conectando qBittorrent (intento ${attempt + 1}): ${error.message}`);
      qbtGlobal = null;
      
      // Si no es el último intento, esperar con backoff exponencial
      if (attempt < MAX_QB_RETRIES - 1) {
        const waitTime = QB_RETRY_DELAY * Math.pow(2, attempt); // 2s, 4s, 8s
        console.log(`⏳ Reintentando en ${waitTime}s...`);
        await sleep(waitTime);
      } else {
        console.log(`❌ No se pudo conectar a qBittorrent después de ${MAX_QB_RETRIES} intentos`);
        throw error;
      }
    }
  }
  
  throw new Error('No se pudo conectar a qBittorrent');
}

/**
 * Verificar/Agregar torrent usando el flujo optimizado SIN TAGs
 * @param {string} latamId - ID del torrent en Lat-Team
 * @param {string} type - Tipo: 'movie' o 'series'
 * @returns {Promise<{hash: string, torrent: object}>}
 */
async function ensureTorrentExists(latamId, type) {
  const qbt = await getQbtClient();
  
  // 1. Verificar si existe en DB local
  let dbEntry = database.get(latamId);
  
  if (dbEntry) {
    console.log(`📂 Torrent en DB: ${latamId} → Hash: ${dbEntry.infoHash.substring(0, 8)}...`);
    
    // 2. Verificar en qBittorrent por hash
    const { exists, torrent } = await qbt.verificarHash(dbEntry.infoHash);
    
    if (exists) {
      console.log(`✅ Torrent existe en qBittorrent (reutilizando)`);
      return { hash: dbEntry.infoHash, torrent };
    } else {
      console.log(`⚠️  Torrent en DB pero no en qBittorrent, re-agregando...`);
    }
  }
  
  // 3. Descargar .torrent y extraer hash
  const torrentUrl = `https://lat-team.com/torrent/download/${latamId}.${TORRENT_API_KEY}`;
  const torrentInfo = await getTorrentInfo(torrentUrl);
  
  // 4. Guardar en DB
  database.set(latamId, {
    infoHash: torrentInfo.infoHash,
    name: torrentInfo.name,
    size: torrentInfo.length,
    files: torrentInfo.files,
    type: type,
    addedAt: new Date().toISOString()
  });
  
  // 5. Verificar NUEVAMENTE en qBittorrent (por si ya existía sin estar en DB)
  const { exists: alreadyExists, torrent: existingTorrent } = await qbt.verificarHash(torrentInfo.infoHash);
  
  if (alreadyExists) {
    console.log(`✅ Torrent ya existía en qBittorrent (migrado a DB)`);
    return { hash: torrentInfo.infoHash, torrent: existingTorrent };
  }
  
  // 6. Agregar torrent nuevo
  const savePath = type === 'movie' ? TORRENT_MOVIES_PATH : TORRENT_SERIES_PATH;
  await qbt.agregarTorrentDesdeUrl(torrentUrl, savePath);
  console.log(`✅ Torrent agregado a qBittorrent en: ${savePath}`);
  
  // Esperar un momento para que qBittorrent procese
  await sleep(RETRY_DELAY);
  
  // 7. Obtener info del torrent recién agregado
  const { torrent: newTorrent } = await qbt.verificarHash(torrentInfo.infoHash);
  
  return { hash: torrentInfo.infoHash, torrent: newTorrent };
}

// Manifest del addon
const MANIFEST = {
  id: 'org.stremio.Lat-Team',
  version: '1.0.0',
  name: 'Lat-Team',
  description: 'Sitio de streaming de Lat-Team',
  types: ['movie', 'series'],
  catalogs: [],
  resources: [
    { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt', 'hpy'] }
  ]
};

// Hook para validar addon_key en rutas protegidas
fastify.addHook('preHandler', async (request, reply) => {
  const protectedRoutes = ['/manifest.json', '/stream/', '/rd1/', '/rd2/'];
  const isProtected = protectedRoutes.some(route => request.url.includes(route));
  
  if (isProtected) {
    const addonKey = request.params.add_key;
    if (addonKey !== ADDON_KEY) {
      reply.code(403).send({ error: 'Clave de addon incorrecta' });
    }
  }
});

// Ruta: Manifest
fastify.get('/:add_key/manifest.json', {
  schema: {
    params: {
      type: 'object',
      required: ['add_key'],
      properties: {
        add_key: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  console.log('✓ Manifesto solicitado');
  return MANIFEST;
});

// Ruta: Stream
fastify.get('/:add_key/stream/:type/:id.json', {
  schema: {
    params: {
      type: 'object',
      required: ['add_key', 'type', 'id'],
      properties: {
        add_key: { type: 'string' },
        type: { enum: ['movie', 'series'] },
        id: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  const { type, id } = request.params;
  
  try {
    // Obtener cliente qBittorrent (reutilizable)
    let qbtClient = null;
    try {
      qbtClient = await getQbtClient();
    } catch (error) {
      console.log(`⚠️  No se pudo conectar a qBittorrent: ${error.message}`);
    }
    
    const streams = await consultarLatamTmdb(
      id,
      LATAM_TOKEN,
      TMDB_KEY,
      DOMAIN,
      ADDON_KEY,
      qbtClient
    );
    return { streams };
  } catch (error) {
    console.log(`Error obteniendo streams: ${error.message}`);
    return { streams: [] };
  }
});

// Ruta: Redirección películas (rd1)
fastify.route({
  method: ['GET', 'HEAD'],
  url: '/:add_key/rd1/:id',
  schema: {
    params: {
      type: 'object',
      required: ['add_key', 'id'],
      properties: {
        add_key: { type: 'string' },
        id: { type: 'string' }
      }
    }
  },
  handler: async (request, reply) => {
    const { id } = request.params;
    const cacheKey = `movie_${id}`;

    // Verificar caché primero
    const cachedUrl = cache.get(cacheKey, CACHE_DURATION);
    if (cachedUrl) {
      return reply.redirect(cachedUrl);
    }

    // Si es HEAD request, devolver 200 sin procesar
    if (request.method === 'HEAD') {
      return reply.code(200).send();
    }

    console.log(`Redireccionando película ID: ${id}`);

    try {
      // Usar flujo optimizado SIN TAGs
      const { hash, torrent } = await ensureTorrentExists(id, 'movie');
      
      // Reintentar hasta obtener el stream
      for (let intento = 0; intento < MAX_RETRIES; intento++) {
        const { exists, torrent: currentTorrent } = await (await getQbtClient()).verificarHash(hash);
        
        if (exists && currentTorrent.content_path) {
          const nuevaUrl = await (await getQbtClient()).obtenerStreamsDeTorrent(
            currentTorrent.content_path,
            STREAM_API_URL,
            STREAM_API_TOKEN,
            STREAM_API_VERIFY_SSL
          );
          
          if (nuevaUrl) {
            console.log(`Stream obtenido: ${nuevaUrl}`);
            cache.set(cacheKey, nuevaUrl);
            return reply.redirect(nuevaUrl);
          }
        }

        console.log(`Intento ${intento + 1}/${MAX_RETRIES} - Esperando torrent...`);
        if (intento < MAX_RETRIES - 1) await sleep(RETRY_DELAY);
      }

      return reply.code(404).send({ error: 'No se pudo obtener el stream después de varios intentos' });
    } catch (error) {
      console.log(`Error en redireccionar: ${error.message}`);
      return reply.code(500).send({ error: error.message });
    }
  }
});

// Ruta: Redirección series (rd2)
fastify.route({
  method: ['GET', 'HEAD'],
  url: '/:add_key/rd2/:season/:episode/:id',
  schema: {
    params: {
      type: 'object',
      required: ['add_key', 'season', 'episode', 'id'],
      properties: {
        add_key: { type: 'string' },
        season: { type: 'string' },
        episode: { type: 'string' },
        id: { type: 'string' }
      }
    }
  },
  handler: async (request, reply) => {
    const { season, episode, id } = request.params;
    const cacheKey = `series_${id}_S${season}E${episode}`;

    // Verificar caché primero
    const cachedUrl = cache.get(cacheKey, CACHE_DURATION);
    if (cachedUrl) {
      return reply.redirect(cachedUrl);
    }

    // Si es HEAD request, devolver 200 sin procesar
    if (request.method === 'HEAD') {
      return reply.code(200).send();
    }

    console.log(`Redireccionando serie S${season}E${episode} ID: ${id}`);

    try {
      const qbt = await getQbtClient();
      
      // Usar flujo optimizado SIN TAGs
      const { hash } = await ensureTorrentExists(id, 'series');

      // Reintentar hasta obtener el episodio
      for (let intento = 0; intento < MAX_RETRIES; intento++) {
        try {
          // Usar hash en lugar de ID
          const { idArchivo, rutaArchivo, hash: torrentHash } = await qbt.obtenerIdCapituloByHash(season, episode, hash);

          // Limpiar ruta de archivo
          let cleanPath = rutaArchivo;
          const parts = cleanPath.split('/');
          if (parts.length > 2) {
            cleanPath = parts.slice(1).join('/');
          }
          // Si las dos partes son iguales, usar solo una
          if (parts.length === 2 && parts[0] === parts[1]) {
            cleanPath = parts[1];
          }

          console.log(`ID Capítulo: ${idArchivo}, Ruta: ${cleanPath}`);

          await qbt.subirPrioridadArchivo(torrentHash, idArchivo);
          const location = `${TORRENT_SERIES_PATH}/${cleanPath}`;
          const nuevaUrl = await qbt.obtenerStreamsDeTorrent(
            location,
            STREAM_API_URL,
            STREAM_API_TOKEN,
            STREAM_API_VERIFY_SSL
          );

          if (nuevaUrl) {
            console.log(`Stream obtenido: ${nuevaUrl}`);
            cache.set(cacheKey, nuevaUrl);
            return reply.redirect(nuevaUrl);
          }
        } catch (error) {
          console.log(`Intento ${intento + 1}/${MAX_RETRIES} - ${error.message}`);
        }
        
        if (intento < MAX_RETRIES - 1) await sleep(RETRY_DELAY);
      }

      return reply.code(404).send({ error: 'No se pudo obtener el stream del episodio después de varios intentos' });
    } catch (error) {
      console.log(`Error en redireccionar2: ${error.message}`);
      return reply.code(500).send({ error: error.message });
    }
  }
});

// Iniciar servidor
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 Servidor Fastify corriendo en http://${HOST}:${PORT}`);
    console.log(`📦 Addon disponible en: ${DOMAIN}/${ADDON_KEY}/manifest.json\n`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
