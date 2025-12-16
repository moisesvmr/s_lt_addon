require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const cors = require('@fastify/cors');
const QBittorrentClient = require('./services/qbittorrent');
const { consultarLatamTmdb } = require('./services/streaming');
const cache = require('./services/cache');
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
const TORRENT_BASE_PATH = process.env.TORRENT_BASE_PATH;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '2');
const STREAM_API_URL = process.env.STREAM_API_URL ;
const STREAM_API_TOKEN = process.env.STREAM_API_TOKEN ;
const STREAM_API_VERIFY_SSL = (process.env.STREAM_API_VERIFY_SSL || 'true').toLowerCase() === 'true';
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION || '3600');
const PORT = parseInt(process.env.PORT || '5000');
const HOST = process.env.HOST || '0.0.0.0';

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
    const streams = await consultarLatamTmdb(
      id,
      LATAM_TOKEN,
      TMDB_KEY,
      DOMAIN,
      ADDON_KEY
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
      const qbt = new QBittorrentClient(QBIT_HOST, QBIT_USER, QBIT_PASS);
      await qbt.connect();

      // Verificar si el torrent ya existe
      const torrentsExistentes = await qbt.obtenerTorrentsConEtiqueta(id);
      if (torrentsExistentes.length === 0) {
        const torrentUrl = `https://lat-team.com/torrent/download/${id}.${TORRENT_API_KEY}`;
        await qbt.agregarTorrentDesdeUrl(torrentUrl, id);
      } else {
        console.log(`Torrent ${id} ya existe, reutilizando...`);
      }

      // Reintentar hasta obtener el torrent
      let nuevaUrl = null;
      for (let intento = 0; intento < MAX_RETRIES; intento++) {
        await sleep(RETRY_DELAY);
        const torrentInfo = await qbt.obtenerTorrentsConEtiqueta(id);

        if (torrentInfo.length > 0) {
          for (const torrentPath of torrentInfo) {
            nuevaUrl = await qbt.obtenerStreamsDeTorrent(
              torrentPath,
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
        }

        console.log(`Intento ${intento + 1}/${MAX_RETRIES} - Esperando torrent...`);
      }

      // Si después de todos los intentos no hay URL
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
      const qbt = new QBittorrentClient(QBIT_HOST, QBIT_USER, QBIT_PASS);
      await qbt.connect();

      // Verificar si el torrent ya existe
      const torrentsExistentes = await qbt.obtenerTorrentsConEtiqueta(id);
      if (torrentsExistentes.length === 0) {
        const torrentUrl = `https://lat-team.com/torrent/download/${id}.${TORRENT_API_KEY}`;
        await qbt.agregarTorrentDesdeUrl(torrentUrl, id);
      } else {
        console.log(`Torrent ${id} ya existe, reutilizando...`);
      }

      // Reintentar hasta obtener el episodio
      let nuevaUrl = null;
      for (let intento = 0; intento < MAX_RETRIES; intento++) {
        await sleep(RETRY_DELAY);

        try {
          const { idArchivo, rutaArchivo, hash } = await qbt.obtenerIdCapitulo(season, episode, id);

          // Limpiar ruta de archivo
          let cleanPath = rutaArchivo;
          if (cleanPath.split('/').length > 2) {
            const parts = cleanPath.split('/');
            cleanPath = parts.slice(1).join('/');
          }

          // Si las dos partes separadas por / son iguales, eliminar una
          if (cleanPath.includes('/')) {
            const parts = cleanPath.split('/');
            if (parts.length === 2 && parts[0] === parts[1]) {
              cleanPath = parts[1];
            }
          }

          console.log(`ID Capítulo: ${idArchivo}, Ruta: ${cleanPath}`);

          await qbt.subirPrioridadArchivo(hash, idArchivo);
          const location = `${TORRENT_BASE_PATH}/${cleanPath}`;
          nuevaUrl = await qbt.obtenerStreamsDeTorrent(
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
      }

      // Si después de todos los intentos no hay URL
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
