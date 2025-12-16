const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

/**
 * Cliente para interactuar con la API de qBittorrent
 */
class QBittorrentClient {
  constructor(host, username, password) {
    this.host = host;
    this.username = username;
    this.password = password;
    this.session = null;
    this.cookieJar = new CookieJar();
  }

  /**
   * Conectar a qBittorrent y obtener sesión autenticada
   */
  async connect() {
    console.log(`\n🔌 [conectar_qbittorrent] Intentando conectar...`);
    console.log(`   Host: ${this.host}`);
    console.log(`   Usuario: ${this.username}`);
    console.log(`   Password: ${'*'.repeat(this.password?.length || 0)}`);

    const url = `${this.host}/api/v2/auth/login`;
    
    try {
      // Crear una instancia de axios que mantenga las cookies
      this.session = wrapper(axios.create({
        baseURL: this.host,
        timeout: 10000,
        jar: this.cookieJar,
        withCredentials: true
      }));

      // qBittorrent espera los datos como application/x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);

      const response = await this.session.post('/api/v2/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`   Status code: ${response.status}`);
      console.log(`   Response: ${response.data}`);

      if (response.status === 200 && response.data === 'Ok.') {
        console.log(`   ✅ Conexión exitosa`);
        return this.session;
      } else {
        console.log(`   ❌ Error: Credenciales incorrectas o servidor no responde`);
        throw new Error('Error de autenticación con qBittorrent');
      }
    } catch (error) {
      console.log(`   ❌ Excepción al conectar: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si un hash existe en qBittorrent
   */
  async verificarHash(infoHash) {
    const response = await this.session.get(`/api/v2/torrents/info`, {
      params: { hashes: infoHash }
    });

    if (response.status === 200) {
      return response.data.length > 0;
    } else {
      console.log('Error al verificar el hash en qBittorrent');
      return false;
    }
  }

  /**
   * Agregar torrent desde URL con etiqueta y descarga secuencial
   */
  async agregarTorrentDesdeUrl(torrentUrl, etiqueta) {
    console.log(`\n➕ [agregar_torrent_desde_url] Agregando torrent...`);
    console.log(`   URL: ${torrentUrl}`);
    console.log(`   Etiqueta: ${etiqueta}`);
    console.log(`   Host: ${this.host}`);

    try {
      const params = new URLSearchParams();
      params.append('urls', torrentUrl);
      params.append('tags', etiqueta);
      params.append('sequentialDownload', 'true');
      params.append('firstLastPiecePrio', 'true');

      const response = await this.session.post('/api/v2/torrents/add', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`   Status code: ${response.status}`);
      console.log(`   Response: ${response.data}`);

      if (response.status === 200) {
        console.log(`   ✅ Torrent agregado exitosamente`);
      } else {
        console.log(`   ❌ Error al agregar el torrent`);
      }
    } catch (error) {
      console.log(`   ❌ Excepción al agregar torrent: ${error.message}`);
    }
  }

  /**
   * Obtener torrents con una etiqueta específica y formato válido
   */
  async obtenerTorrentsConEtiqueta(etiqueta) {
    console.log(`\n🔍 [obtener_torrents_con_etiqueta] Buscando torrents...`);
    console.log(`   Etiqueta: ${etiqueta}`);
    console.log(`   Host: ${this.host}`);

    try {
      const response = await this.session.get('/api/v2/torrents/info', {
        params: { filter: 'all' }
      });

      console.log(`   Status code: ${response.status}`);

      const torrentsConEtiqueta = [];

      if (response.status === 200) {
        const torrents = response.data;
        console.log(`   Total torrents en qBittorrent: ${torrents.length}`);

        for (const torrent of torrents) {
          // Manejar tags como string o lista
          let tags = torrent.tags || [];
          if (typeof tags === 'string') {
            tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
          }

          console.log(`   Torrent: ${(torrent.name || 'Sin nombre').substring(0, 50)}... Tags: ${tags}`);

          if (tags.includes(etiqueta)) {
            const formatosPermitidos = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];
            const contentPath = torrent.content_path || '';
            console.log(`      ✓ Etiqueta coincide! Path: ${contentPath}`);

            if (formatosPermitidos.some(ext => contentPath.toLowerCase().endsWith(`.${ext}`))) {
              torrentsConEtiqueta.push(contentPath);
              console.log(`      ✅ Formato válido, agregado a lista`);
            } else {
              console.log(`      ⚠️  Formato no válido, ignorado`);
            }
          }
        }
      } else {
        console.log(`   ❌ Error al obtener torrents: ${response.status}`);
      }

      console.log(`   Resultado: ${torrentsConEtiqueta.length} torrents encontrados`);
      return torrentsConEtiqueta;
    } catch (error) {
      console.log(`   ❌ Excepción: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtener hashes de torrents con una etiqueta específica
   */
  async obtenerHashConEtiqueta(etiqueta) {
    console.log(`\n🔑 [obtener_hash_con_etiqueta] Obteniendo hashes...`);
    console.log(`   Etiqueta: ${etiqueta}`);
    console.log(`   Host: ${this.host}`);

    const response = await this.session.get('/api/v2/torrents/info', {
      params: { filter: 'all' }
    });

    console.log(`   Status code: ${response.status}`);

    const hashList = [];
    if (response.status === 200) {
      const torrents = response.data;
      console.log(`   Total torrents: ${torrents.length}`);

      for (const torrent of torrents) {
        const tags = torrent.tags || '';
        console.log(`      Torrent: ${(torrent.name || 'Sin nombre').substring(0, 40)}... Tags: ${tags}`);

        if (tags.includes(etiqueta)) {
          hashList.push(torrent.hash);
          console.log(`         ✅ Hash agregado: ${torrent.hash}`);
        }
      }
    } else {
      console.log(`   ❌ Error al obtener torrents`);
    }

    console.log(`   Total hashes encontrados: ${hashList.length}`);
    return hashList;
  }

  /**
   * Obtener archivos de un torrent por su hash
   */
  async obtenerArchivosDeTorrent(torrentHash) {
    console.log(`\n📁 [obtener_archivos_de_torrent] Obteniendo archivos...`);
    console.log(`   Hash: ${torrentHash}`);
    console.log(`   Host: ${this.host}`);

    const response = await this.session.get('/api/v2/torrents/files', {
      params: { hash: torrentHash }
    });

    console.log(`   Status code: ${response.status}`);

    const archivos = [];
    if (response.status === 200) {
      const files = response.data;
      console.log(`   Total archivos: ${files.length}`);

      for (const file of files) {
        const archivoInfo = {
          id: file.index,
          path: file.name
        };
        archivos.push(archivoInfo);
        console.log(`      [${file.index}] ${file.name}`);
      }
    } else {
      console.log(`   ❌ Error al obtener archivos del torrent`);
    }

    return archivos;
  }

  /**
   * Obtener nombre del torrent por su hash
   */
  async obtenerNombreTorrent(torrentHash) {
    console.log(`\n📝 [obtener_nombre_torrent] Obteniendo nombre...`);
    console.log(`   Hash: ${torrentHash}`);
    console.log(`   Host: ${this.host}`);

    const response = await this.session.get('/api/v2/torrents/info', {
      params: { hashes: torrentHash }
    });

    console.log(`   Status code: ${response.status}`);

    if (response.status === 200) {
      const torrents = response.data;
      if (torrents.length > 0) {
        const nombre = torrents[0].name;
        console.log(`   ✅ Nombre: ${nombre}`);
        return nombre;
      } else {
        console.log(`   ❌ No se encontró torrent con hash ${torrentHash}`);
        return null;
      }
    } else {
      console.log(`   ❌ Error obteniendo nombre del torrent`);
      return null;
    }
  }

  /**
   * Obtener ID de capítulo específico (para series)
   */
  async obtenerIdCapitulo(season, episode, id) {
    console.log(`\n📺 [obtener_id_capitulo] Buscando episodio...`);
    console.log(`   Season original: ${season}`);
    console.log(`   Episode original: ${episode}`);
    console.log(`   ID etiqueta: ${id}`);
    console.log(`   Host: ${this.host}`);

    // Si season y episode son de un dígito, agregar un 0 adelante
    if (season.length === 1) season = '0' + season;
    if (episode.length === 1) episode = '0' + episode;

    const cap = `S${season}E${episode}`;
    console.log(`   Capítulo formateado: ${cap}`);

    const torrents = await this.obtenerHashConEtiqueta(id);
    console.log(`   Hashes encontrados: ${torrents}`);

    let hash = null;
    for (const torrentHash of torrents) {
      hash = torrentHash;
    }

    if (hash === null) {
      console.log(`   ❌ No se encontró torrent con etiqueta ${id}`);
      throw new Error(`No se encontró torrent con etiqueta ${id}`);
    }

    console.log(`   Hash seleccionado: ${hash}`);
    const nombreTorrent = await this.obtenerNombreTorrent(hash);
    console.log(`   Nombre torrent: ${nombreTorrent}`);

    const archivos = await this.obtenerArchivosDeTorrent(hash);
    console.log(`   Total archivos en torrent: ${archivos.length}`);

    let idArchivo = null;
    let archivo1 = null;

    for (const archivo of archivos) {
      console.log(`      Archivo ${archivo.id}: ${archivo.path}`);

      if (new RegExp(cap, 'i').test(archivo.path)) {
        archivo1 = archivo.path;
        idArchivo = archivo.id;
        console.log(`      ✅ Coincidencia encontrada!`);
        break;
      }
    }

    if (idArchivo === null || archivo1 === null) {
      console.log(`   ❌ No se encontró archivo con patrón ${cap}`);
      throw new Error(`No se encontró episodio ${cap} en el torrent`);
    }

    const resultado = {
      idArchivo,
      rutaArchivo: `${nombreTorrent}/${archivo1}`,
      hash
    };
    console.log(`   Resultado: ID=${resultado.idArchivo}, Path=${resultado.rutaArchivo}, Hash=${resultado.hash}`);
    return resultado;
  }

  /**
   * Subir la prioridad de descarga de un archivo específico
   */
  async subirPrioridadArchivo(torrentHash, fileId) {
    console.log(`\n⬆️  [subir_prioridad_archivo] Cambiando prioridades...`);
    console.log(`   Hash: ${torrentHash}`);
    console.log(`   File ID a priorizar: ${fileId}`);
    console.log(`   Host: ${this.host}`);

    // Primero obtener los archivos del torrent
    const archivos = await this.obtenerArchivosDeTorrent(torrentHash);
    console.log(`   Total archivos: ${archivos.length}`);

    // Bajar la prioridad de todos los archivos a 1
    for (const archivo of archivos) {
      const paramsForm = new URLSearchParams();
      paramsForm.append('hash', torrentHash);
      paramsForm.append('id', archivo.id);
      paramsForm.append('priority', '1');

      const responseBajar = await this.session.post('/api/v2/torrents/filePrio', paramsForm, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (responseBajar.status === 200) {
        console.log(`   ✓ Archivo ${archivo.id} → prioridad 1`);
      } else {
        console.log(`   ✗ Error bajando prioridad archivo ${archivo.id}`);
      }
    }

    // Subir la prioridad del archivo específico a 7
    const paramsForm = new URLSearchParams();
    paramsForm.append('hash', torrentHash);
    paramsForm.append('id', fileId);
    paramsForm.append('priority', '7');

    const responseSubir = await this.session.post('/api/v2/torrents/filePrio', paramsForm, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (responseSubir.status === 200) {
      console.log(`   ✅ Archivo ${fileId} → prioridad 7 (máxima)`);
    } else {
      console.log(`   ❌ Error subiendo prioridad archivo ${fileId}`);
    }
  }

  /**
   * Obtener URL de stream para un torrent
   */
  async obtenerStreamsDeTorrent(torrentPath, streamApiUrl, streamApiToken, streamApiVerifySsl) {
    console.log(`\n🎬 [obtener_streams_de_torrent] Obteniendo stream...`);
    console.log(`   Path: ${torrentPath}`);
    console.log(`   API URL: ${streamApiUrl}`);
    console.log(`   Verify SSL: ${streamApiVerifySsl}`);
    console.log(`   Token: ${streamApiToken?.substring(0, 20)}...`);

    const params = { path: torrentPath };
    console.log(`   Params JSON: ${JSON.stringify(params)}`);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': streamApiToken
    };

    try {
      const axiosConfig = {
        headers,
        timeout: 10000,
        httpsAgent: streamApiVerifySsl ? undefined : new (require('https').Agent)({
          rejectUnauthorized: false
        })
      };

      if (!streamApiVerifySsl) {
        console.log(`   ⚠️  Verificación SSL deshabilitada`);
      }

      console.log(`   Enviando POST request...`);
      const response = await axios.post(streamApiUrl, params, axiosConfig);
      console.log(`   Status code: ${response.status}`);
      const responseText = JSON.stringify(response.data);
      console.log(`   Response text: ${responseText.length > 200 ? responseText.substring(0, 200) + '...' : responseText}`);

      if (response.status === 200) {
        const responseData = response.data;
        console.log(`   Response JSON: ${JSON.stringify(responseData)}`);
        const streams = responseData.url;

        if (streams) {
          console.log(`   ✅ Stream obtenido: ${streams}`);
          return streams;
        } else {
          console.log(`   ❌ Respuesta no contiene 'url'`);
          return null;
        }
      } else {
        console.log(`   ❌ Error HTTP ${response.status}: ${response.data}`);
        return null;
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`   ❌ Timeout (10s) al conectar con API`);
      } else if (error.response) {
        console.log(`   ❌ Error HTTP: ${error.response.status}`);
      } else {
        console.log(`   ❌ Excepción inesperada: ${error.message}`);
      }
      return null;
    }
  }
}

module.exports = QBittorrentClient;
