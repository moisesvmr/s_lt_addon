/**
 * Utilidades para formateo y parseo de información
 */

/**
 * Formatear tamaño de archivo
 */
function formatSize(size) {
  if (size > 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  } else {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Parsear información del media_info
 */
function parseMediaInfo(mediaInfo) {
  const info = {
    codec: null,
    hdr: null,
    audio: null,
    channels: null,
    languages: [],
    duration: null
  };

  if (!mediaInfo) return info;

  // Buscar codec de video
  const codecMatch = mediaInfo.match(/Format\s*:\s*(HEVC|AVC|H\.265|H\.264)/i);
  if (codecMatch) {
    const codec = codecMatch[1].toUpperCase();
    info.codec = codec.includes('HEVC') || codec.includes('H.265') ? '🎞️ HEVC' : '🎞️ AVC';
  }

  // Buscar HDR
  if (mediaInfo.includes('HDR10') || mediaInfo.includes('HDR')) {
    info.hdr = '📺 HDR10';
  }
  if (mediaInfo.includes('Dolby Vision') || mediaInfo.includes('DV')) {
    info.hdr = '📺 DV' + (info.hdr ? ' HDR10' : '');
  }

  // Buscar audio
  if (mediaInfo.includes('Dolby TrueHD with Dolby Atmos') || mediaInfo.includes('Atmos')) {
    info.audio = '🎧 Atmos';
  } else if (mediaInfo.includes('TrueHD')) {
    info.audio = '🎧 TrueHD';
  } else if (mediaInfo.includes('DTS-HD Master Audio') || mediaInfo.includes('DTS-HD MA')) {
    info.audio = '🎧 DTS-HD MA';
  } else if (mediaInfo.includes('E-AC-3') || mediaInfo.includes('DD+') || mediaInfo.includes('Dolby Digital Plus')) {
    info.audio = '🎧 DD+';
  } else if (mediaInfo.includes('AC-3') || mediaInfo.includes('Dolby Digital')) {
    info.audio = '🎧 DD';
  }

  // Buscar canales de audio
  const channelsMatch = mediaInfo.match(/Channel\(s\)\s*:\s*(\d+)\s*channels?/);
  if (channelsMatch) {
    const ch = parseInt(channelsMatch[1]);
    if (ch === 8) {
      info.channels = '🔊 7.1';
    } else if (ch === 6) {
      info.channels = '🔊 5.1';
    } else if (ch === 2) {
      info.channels = '🔊 2.0';
    }
  }

  // Buscar idiomas de audio (optimizado con matchAll)
  const langRegex = /Title\s*:\s*([^\r\n]+).*?Language\s*:\s*(\w+)/gi;
  const seenLangs = new Set();
  
  // matchAll es más eficiente que exec en un loop
  const matches = [...mediaInfo.matchAll(langRegex)];
  
  for (const match of matches) {
    const [, title, lang] = match;
    const contextStart = match.index;
    const context = mediaInfo.substring(contextStart, contextStart + 200);
    
    if (title.toLowerCase().includes('audio') || context.includes('Audio')) {
      const langEmoji = {
        'english': '🇬🇧',
        'spanish': '🇪🇸',
        'latin': '🇲🇽',
        'portuguese': '🇧🇷',
        'french': '🇫🇷',
        'german': '🇩🇪',
        'italian': '🇮🇹',
        'japanese': '🇯🇵'
      };
      
      for (const [key, emoji] of Object.entries(langEmoji)) {
        if (lang.toLowerCase().includes(key) || title.toLowerCase().includes(key)) {
          if (!seenLangs.has(emoji)) {
            info.languages.push(emoji);
            seenLangs.add(emoji);
          }
          break;
        }
      }
    }
  }

  // Buscar duración
  const durationMatch = mediaInfo.match(/Duration\s*:\s*(\d+)\s*h\s*(\d+)\s*min/);
  if (durationMatch) {
    const hours = parseInt(durationMatch[1]);
    const mins = parseInt(durationMatch[2]);
    info.duration = `⏱️ ${hours}h:${mins}m`;
  }

  return info;
}

/**
 * Delay asíncrono
 */
function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

module.exports = {
  formatSize,
  parseMediaInfo,
  sleep
};
