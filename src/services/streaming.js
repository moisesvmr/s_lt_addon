const axios = require('axios');
const { formatSize, parseMediaInfo } = require('../utils/helpers');
const { obtenerInfoUsuario } = require('./tracker');
const { verificarCacheQbt, verificarCacheBatch, buscarTorrents, coincideEpisodio } = require('./streaming-helpers');

/**
 * Formatear título del stream al estilo Torrentio/Aiostream
 */
function formatStreamTitle(item) {
  const attrs = item.attributes;
  const name = attrs.name;
  const resolution = attrs.resolution || '';
  const typeRelease = attrs.type || '';
  const size = attrs.size || 0;
  const sizeFormatted = formatSize(size);
  const seeders = attrs.seeders || 0;
  const leechers = attrs.leechers || 0;
  const freeleech = attrs.freeleech || '0%';
  const uploader = attrs.uploader || 'Unknown';

  // Parsear media_info
  const mediaInfoData = parseMediaInfo(attrs.media_info || '');

  // Construir título formateado
  const lines = [];

  // Primera línea: resolución
  const resolutionEmoji = {
    '2160p': '🔥 4K UHD',
    '1080p': '💎 FHD',
    '720p': '📺 HD',
    '480p': '📱 SD'
  };
  const resDisplay = resolutionEmoji[resolution] || `📺 ${resolution}`;
  lines.push(resDisplay);

  // Segunda línea: nombre (truncado si es muy largo)
  let displayName = name;
  if (displayName.length > 60) {
    displayName = displayName.substring(0, 57) + '...';
  }
  lines.push(`🎬 ${displayName}`);

  // Tercera línea: tipo, codec, hdr, duración
  const techLine = [];
  if (typeRelease) {
    techLine.push(`🎥 ${typeRelease}`);
  }
  if (mediaInfoData.hdr) {
    techLine.push(mediaInfoData.hdr);
  }
  if (mediaInfoData.codec) {
    techLine.push(mediaInfoData.codec);
  }
  if (mediaInfoData.duration) {
    techLine.push(mediaInfoData.duration);
  }

  if (techLine.length > 0) {
    lines.push(techLine.join(' '));
  }

  // Cuarta línea: audio
  const audioLine = [];
  if (mediaInfoData.audio) {
    audioLine.push(mediaInfoData.audio);
  }
  if (mediaInfoData.channels) {
    audioLine.push(mediaInfoData.channels);
  }
  if (mediaInfoData.languages.length > 0) {
    audioLine.push('🗣️ ' + mediaInfoData.languages.join(' / '));
  }

  if (audioLine.length > 0) {
    lines.push(audioLine.join(' '));
  }

  // Quinta línea: tamaño, uploader, tracker
  lines.push(`📦 ${sizeFormatted} 🏷️ ${uploader} 📡 Lat-Team`);

  // Sexta línea: seeds/leech y freeleech
  let statusLine = `👥 S:${seeders} L:${leechers}`;
  if (freeleech !== '0%') {
    statusLine += ` 🔓 Free: ${freeleech}`;
  }
  lines.push(statusLine);

  return lines.join('\n');
}

/**
 * Ordenar streams por resolución y seeders
 * Los primeros 2 streams (estadísticas) no se ordenan
 */
function sortStreams(streams) {
  if (streams.length <= 2) {
    return streams;
  }

  // Separar estadísticas (primeros 2) de los torrents
  const statsStreams = streams.slice(0, 2);
  const torrentStreams = streams.slice(2);

  // Peso de resoluciones
  const resolutionWeight = {
    '2160p': 4,
    '1080p': 3,
    '720p': 2,
    '480p': 1
  };

  // Extraer resolución y seeders del título
  const parseStreamData = (stream) => {
    const title = stream.title;
    
    // Buscar resolución
    let resolution = null;
    let resWeight = 0;
    for (const [res, weight] of Object.entries(resolutionWeight)) {
      if (title.includes(res)) {
        resolution = res;
        resWeight = weight;
        break;
      }
    }

    // Buscar seeders (formato: S:123)
    const seedMatch = title.match(/S:(\d+)/);
    const seeders = seedMatch ? parseInt(seedMatch[1]) : 0;

    return { resolution, resWeight, seeders, stream };
  };

  // Parsear y ordenar
  const parsedStreams = torrentStreams.map(parseStreamData);
  
  parsedStreams.sort((a, b) => {
    // Primero por resolución (descendente)
    if (b.resWeight !== a.resWeight) {
      return b.resWeight - a.resWeight;
    }
    // Luego por seeders (descendente)
    return b.seeders - a.seeders;
  });

  // Reconstruir array: estadísticas + torrents ordenados
  return [...statsStreams, ...parsedStreams.map(p => p.stream)];
}

/**
 * Convertir ID de IMDB a TMDB
 */
async function convertirImdbATmdb(id, apiKey) {
  // Solo si id tiene el formato tt32766897:1:2 tomar la parte de IMDB
  let imdbId = id;
  if (id.includes(':')) {
    const idParts = id.split(':');
    imdbId = idParts[0];
  }

  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;

  console.log(`Convirtiendo IMDB a TMDB con URL: ${url}`);
  
  try {
    const response = await axios.get(url);
    
    if (response.status === 200) {
      const data = response.data;
      if (data.movie_results && data.movie_results.length > 0) {
        console.log('es una pelicula');
        return { id: data.movie_results[0].id, type: 'movie' };
      } else if (data.tv_results && data.tv_results.length > 0) {
        console.log('es una serie');
        return { id: data.tv_results[0].id, type: 'tv' };
      } else {
        console.log('no se encontro nada');
        return { id: null, type: null };
      }
    } else {
      console.log('Error al convertir ID de IMDB a TMDB');
      return { id: null, type: null };
    }
  } catch (error) {
    console.log(`Error al convertir IMDB a TMDB: ${error.message}`);
    return { id: null, type: null };
  }
}

/**
 * Consultar streams de Lat-Team y TMDB
 */
async function consultarLatamTmdb(id, token, tmdbKey, domain, addonKey, qbtClient = null) {
  const { id: tmdbId, type: tipo } = await convertirImdbATmdb(id, tmdbKey);
  
  // Inicializar array de streams
  const streams = [];
  
  // Agregar streams informativos al inicio (solo una vez)
  // Stream 1: Información del tracker
  try {
    const userInfo = await obtenerInfoUsuario(token);
    if (userInfo) {
      streams.push({
        name: 'Lat-Team',
        title: `👤 ${userInfo.username} [${userInfo.group}]\n📊 Ratio: ${userInfo.ratio} | Buffer: ${userInfo.buffer}\n⬆️  Up: ${userInfo.uploaded} | ⬇️  Down: ${userInfo.downloaded}\n🌱 Seeding: ${userInfo.seeding} | 🔻 Leeching: ${userInfo.leeching}\n🎁 Bonus: ${userInfo.seedbonus} | ⚠️  H&R: ${userInfo.hit_and_runs}`,
        url: 'stremio:///detail/tracker/info'
      });
    }
  } catch (error) {
    console.log(`Error obteniendo info usuario: ${error.message}`);
  }

  // Stream 2: Información de qBittorrent
  if (qbtClient) {
    try {
      const qbtInfo = await qbtClient.obtenerInfoTransferencia();
      if (qbtInfo) {
        streams.push({
          name: 'Lat-Team',
          title: `🖥️  qBittorrent Stats\n⬇️  ${qbtInfo.dlSpeed}/s | ⬆️  ${qbtInfo.upSpeed}/s\n📥 Downloaded: ${qbtInfo.dlData}/s\n📤 Uploaded: ${qbtInfo.upData}\n💾 Espacio libre: ${qbtInfo.freeSpace}`,
          url: 'stremio:///detail/qbittorrent/stats'
        });
      }
    } catch (error) {
      console.log(`Error obteniendo info qBittorrent: ${error.message}`);
    }
  }

  if (tipo === 'movie') {
    const imdbId = id.replace('tt', '');
    
    // Procesar ambas consultas (IMDB y TMDB) de forma eficiente
    const searchQueries = [
      `imdbId=${imdbId}`,
      `tmdbId=${tmdbId}`
    ];
    
    const allTorrents = [];
    for (const query of searchQueries) {
      const torrents = await buscarTorrents(query, [1], token);
      allTorrents.push(...torrents);
    }
    
    // Verificar cache en BATCH (1 sola llamada a qBittorrent)
    const torrentIds = allTorrents.map(item => item.id);
    const cacheMap = await verificarCacheBatch(qbtClient, torrentIds);
    
    // Procesar torrents usando el mapa de cache
    const processedStreams = allTorrents.map((item) => {
      let title = formatStreamTitle(item);
      
      // Obtener estado de cache del mapa
      const enCache = cacheMap.get(item.id) || false;
      if (enCache) {
        title = `⚡ ${title}`;
      }
      
      return {
        title,
        url: `${domain}/${addonKey}/rd1/${item.id}`
      };
    });
    
    streams.push(...processedStreams);
    
    // Eliminar duplicados por URL
    const uniqueStreams = {};
    for (const stream of streams) {
      uniqueStreams[stream.url] = stream;
    }
    
    // Ordenar por resolución y seeders
    return sortStreams(Object.values(uniqueStreams));
  } else {
    // Es una serie
    const idParts = id.split(':');
    const imdb = idParts[0].replace('tt', '');
    const seasonNumber = idParts[1];
    const episodeNumber = idParts[2];

    // Procesar ambas consultas (IMDB y TMDB)
    const searchQueries = [
      `imdbId=${imdb}`,
      `tmdbId=${tmdbId}`
    ];
    
    const allTorrents = [];
    for (const query of searchQueries) {
      const torrents = await buscarTorrents(query, [2, 5, 8, 20], token);
      allTorrents.push(...torrents);
    }
    
    // Filtrar por episodio
    const filteredTorrents = allTorrents.filter(item => 
      coincideEpisodio(item.attributes.name, seasonNumber, episodeNumber)
    );
    
    // Verificar cache en BATCH (1 sola llamada a qBittorrent)
    const torrentIds = filteredTorrents.map(item => item.id);
    const cacheMap = await verificarCacheBatch(qbtClient, torrentIds);
    
    // Procesar usando el mapa de cache
    const processedStreams = filteredTorrents.map((item) => {
      let title = formatStreamTitle(item);
      
      // Obtener estado de cache del mapa
      const enCache = cacheMap.get(item.id) || false;
      if (enCache) {
        title = `⚡ ${title}`;
      }
      
      return {
        title,
        url: `${domain}/${addonKey}/rd2/${seasonNumber}/${episodeNumber}/${item.id}`
      };
    });
    
    streams.push(...processedStreams);

    // Eliminar duplicados
    const uniqueStreams = {};
    for (const stream of streams) {
      uniqueStreams[stream.url] = stream;
    }
    
    // Ordenar por resolución y seeders
    return sortStreams(Object.values(uniqueStreams));
  }
}

module.exports = {
  formatStreamTitle,
  convertirImdbATmdb,
  consultarLatamTmdb
};
