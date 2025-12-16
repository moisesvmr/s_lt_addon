const axios = require('axios');
const { formatSize, parseMediaInfo } = require('../utils/helpers');

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
 * Convertir ID de IMDB a TMDB
 */
async function convertirImdbATmdb(id, apiKey) {
  const url = `https://api.themoviedb.org/3/find/${id}?api_key=${apiKey}&external_source=imdb_id`;
  
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
async function consultarLatamTmdb(id, token, tmdbKey, domain, addonKey) {
  const { id: tmdbId, type: tipo } = await convertirImdbATmdb(id, tmdbKey);

  if (tipo === 'movie') {
    // Eliminar las 'tt' de id
    const streams = [];
    const imdbId = id.replace('tt', '');
    
    // Primera consulta por IMDB
    const url1 = `https://lat-team.com/api/torrents/filter?imdbId=${imdbId}&categories[]=1&alive=True&api_token=${token}`;
    try {
      const response1 = await axios.get(url1);
      const latTeamData = response1.data;
      
      for (const item of latTeamData.data) {
        const title = formatStreamTitle(item);
        const urlF = `${domain}/${addonKey}/rd1/${item.id}`;
        streams.push({ title, url: urlF });
      }
    } catch (error) {
      console.log(`Error en consulta IMDB: ${error.message}`);
    }

    // Segunda consulta por TMDB
    const url2 = `https://lat-team.com/api/torrents/filter?tmdbId=${tmdbId}&categories[]=1&alive=True&api_token=${token}`;
    try {
      const response2 = await axios.get(url2);
      const latTeamData2 = response2.data;
      
      for (const item of latTeamData2.data) {
        const title = formatStreamTitle(item);
        const urlF = `${domain}/${addonKey}/rd1/${item.id}`;
        streams.push({ title, url: urlF });
      }
    } catch (error) {
      console.log(`Error en consulta TMDB: ${error.message}`);
    }

    // Eliminar duplicados
    const uniqueStreams = {};
    for (const stream of streams) {
      uniqueStreams[stream.url] = stream;
    }
    return Object.values(uniqueStreams);
  } else {
    // Es una serie
    const streams = [];
    const idParts = id.split(':');
    const imdb = idParts[0].replace('tt', '');
    
    const { id: tmdbId } = await convertirImdbATmdb(idParts[0], tmdbKey);
    const seasonNumber = idParts[1];
    const episodeNumber = idParts[2];

    // Primera consulta por IMDB
    const url1 = `https://lat-team.com/api/torrents/filter?imdbId=${imdb}&categories[]=2&categories[]=5&categories[]=8&categories[]=20&alive=True&api_token=${token}`;
    try {
      const response1 = await axios.get(url1);
      const latTeamData = response1.data;
      
      for (const item of latTeamData.data) {
        const name = item.attributes.name;
        const seasonEpisode = `S${seasonNumber.padStart(2, '0')}E${episodeNumber.padStart(2, '0')}`;
        const seasonOnly = `S${seasonNumber.padStart(2, '0')} `;
        
        if (name.includes(seasonEpisode) || name.includes(seasonOnly)) {
          const title = formatStreamTitle(item);
          const urlF = `${domain}/${addonKey}/rd2/${seasonNumber}/${episodeNumber}/${item.id}`;
          streams.push({ title, url: urlF });
        }
      }
    } catch (error) {
      console.log(`Error en consulta IMDB serie: ${error.message}`);
    }

    // Segunda consulta por TMDB
    const url2 = `https://lat-team.com/api/torrents/filter?tmdbId=${tmdbId}&categories[]=2&categories[]=5&categories[]=8&categories[]=20&alive=True&api_token=${token}`;
    try {
      const response2 = await axios.get(url2);
      const latTeamData2 = response2.data;
      
      for (const item of latTeamData2.data) {
        const name = item.attributes.name;
        const seasonEpisode = `S${seasonNumber.padStart(2, '0')}E${episodeNumber.padStart(2, '0')}`;
        const seasonOnly = `S${seasonNumber.padStart(2, '0')} `;
        
        if (name.includes(seasonEpisode) || name.includes(seasonOnly)) {
          const title = formatStreamTitle(item);
          const urlF = `${domain}/${addonKey}/rd2/${seasonNumber}/${episodeNumber}/${item.id}`;
          streams.push({ title, url: urlF });
        }
      }
    } catch (error) {
      console.log(`Error en consulta TMDB serie: ${error.message}`);
    }

    // Eliminar duplicados
    const uniqueStreams = {};
    for (const stream of streams) {
      uniqueStreams[stream.url] = stream;
    }
    return Object.values(uniqueStreams);
  }
}

module.exports = {
  formatStreamTitle,
  convertirImdbATmdb,
  consultarLatamTmdb
};
