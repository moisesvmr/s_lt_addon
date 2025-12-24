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
   * Verificar si un hash existe en qBittorrent y obtener su información
   */
  async verificarHash(infoHash) {
    console.log(`\n🔍 [verificar_hash] Verificando hash en qBittorrent...`);
    console.log(`   Hash: ${infoHash}`);
    
    const response = await this.session.get(`/api/v2/torrents/info`, {
      params: { hashes: infoHash }
    });

    if (response.status === 200 && response.data.length > 0) {
      const torrent = response.data[0];
      console.log(`   ✅ Torrent encontrado: ${torrent.name}`);
      console.log(`   Path: ${torrent.content_path}`);
      return {
        exists: true,
        torrent: torrent
      };
    } else {
      console.log('   ❌ Hash no encontrado en qBittorrent');
      return {
        exists: false,
        torrent: null
      };
    }
  }

  /**
   * Agregar torrent desde URL con directorio específico y descarga secuencial
   */
  async agregarTorrentDesdeUrl(torrentUrl, savePath = null) {
    console.log(`\n➕ [agregar_torrent_desde_url] Agregando torrent...`);
    console.log(`   URL: ${torrentUrl}`);
    console.log(`   Save Path recibido: ${savePath || 'default'}`);
    console.log(`   Save Path tipo: ${typeof savePath}`);
    console.log(`   Host: ${this.host}`);

    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('urls', torrentUrl);
      formData.append('sequentialDownload', 'true');
      formData.append('firstLastPiecePrio', 'true');
      
      // Agregar directorio de descarga si se especifica
      if (savePath) {
        console.log(`   🔧 Configurando savePath: "${savePath}"`);
        formData.append('savepath', savePath);
        formData.append('autoTMM', 'false'); // Deshabilitar gestión automática de torrents
        console.log(`   ✓ savepath y autoTMM agregados al formData`);
      } else {
        console.log(`   ⚠️  No se especificó savePath, usando directorio por defecto de qBittorrent`);
      }

      const response = await this.session.post('/api/v2/torrents/add', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      console.log(`   Status code: ${response.status}`);
      console.log(`   Response data: ${JSON.stringify(response.data)}`);
      console.log(`   Response type: ${typeof response.data}`);

      // qBittorrent puede devolver "Ok." o simplemente status 200
      if (response.status === 200) {
        if (response.data === 'Ok.' || response.data === '' || !response.data) {
          console.log(`   ✅ Torrent agregado exitosamente`);
        } else if (response.data.includes && response.data.includes('Fails')) {
          console.log(`   ❌ Error: ${response.data}`);
        } else {
          console.log(`   ⚠️  Respuesta inesperada: ${response.data}`);
        }
      } else {
        console.log(`   ❌ Error al agregar el torrent`);
      }
    } catch (error) {
      console.log(`   ❌ Excepción al agregar torrent: ${error.message}`);
    }
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
   * Obtener ID de capítulo específico (para series) usando hash directamente
   */
  async obtenerIdCapituloByHash(season, episode, hash) {
    console.log(`\n📺 [obtener_id_capitulo_by_hash] Buscando episodio...`);
    console.log(`   Season original: ${season}`);
    console.log(`   Episode original: ${episode}`);
    console.log(`   Hash: ${hash}`);
    console.log(`   Host: ${this.host}`);

    // Si season y episode son de un dígito, agregar un 0 adelante
    if (season.length === 1) season = '0' + season;
    if (episode.length === 1) episode = '0' + episode;

    const cap = `S${season}E${episode}`;
    console.log(`   Capítulo formateado: ${cap}`);

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

    // Obtener archivos una sola vez
    const archivos = await this.obtenerArchivosDeTorrent(torrentHash);
    console.log(`   Total archivos: ${archivos.length}`);

    // Crear array de promesas para cambiar prioridades en paralelo
    const prioridadPromises = archivos.map(archivo => {
      const paramsForm = new URLSearchParams();
      paramsForm.append('hash', torrentHash);
      paramsForm.append('id', archivo.id);
      paramsForm.append('priority', archivo.id === fileId ? '7' : '1');

      return this.session.post('/api/v2/torrents/filePrio', paramsForm, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }).then(response => {
        if (response.status === 200) {
          const prioText = archivo.id === fileId ? 'prioridad 7 (máxima)' : 'prioridad 1';
          console.log(`   ✓ Archivo ${archivo.id} → ${prioText}`);
          return true;
        } else {
          console.log(`   ✗ Error archivo ${archivo.id}`);
          return false;
        }
      }).catch(error => {
        console.log(`   ✗ Error archivo ${archivo.id}: ${error.message}`);
        return false;
      });
    });

    // Ejecutar todas las actualizaciones en paralelo
    await Promise.all(prioridadPromises);
    console.log(`   ✅ Prioridades actualizadas`);
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

  /**
   * Obtener información de transferencia y espacio de qBittorrent
   */
  async obtenerInfoTransferencia() {
    // Verificar que tenemos sesión activa
    if (!this.session) {
      console.log(`⚠️  Sin sesión activa para obtener info de transferencia`);
      return null;
    }
    
    try {
      const response = await this.session.get('/api/v2/transfer/info');
      
      if (response.status === 200) {
        const info = response.data;
        // Convertir bytes a formato legible
        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        return {
          dlSpeed: formatBytes(info.dl_info_speed),
          upSpeed: formatBytes(info.up_info_speed),
          dlData: formatBytes(info.dl_info_data),
          upData: formatBytes(info.up_info_data),
          freeSpace: formatBytes(info.free_space_on_disk)
        };
      }
      return null;
    } catch (error) {
      console.log(`Error obteniendo info de transferencia: ${error.message}`);
      return null; // No fallar, solo retornar null
    }
  }
}

module.exports = QBittorrentClient;
