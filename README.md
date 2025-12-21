# 🎬 Stremio Lat-Team Addon

Addon de Stremio para streaming de torrents desde [Lat-Team](https://lat-team.com) con integración de qBittorrent.

## ✨ Características Principales

### 🎯 Funcionalidades Core
- **Búsqueda Inteligente**: Encuentra torrents automáticamente usando IMDB o TMDB
- **Streaming Instantáneo**: Reproduce directamente desde qBittorrent sin esperar descarga completa
- **Descarga Secuencial**: Los archivos se descargan en orden para reproducción inmediata
- **Multi-Calidad**: Muestra todas las calidades disponibles (4K, 1080p, 720p, etc.)

### 📊 Sistema de Cache
- **Cache con Estadísticas**: Monitorea hit/miss rate en tiempo real
- **Indicador Visual**: Emoji ⚡ indica torrents ya descargados en cache
- **Auto-renovación**: El cache se extiende automáticamente al acceder

### 📺 Información en Tiempo Real
- **Stats del Tracker**: Ratio, buffer, uploaded, downloaded
- **Stats de qBittorrent**: Velocidad de descarga/subida, espacio libre
- **Info Detallada**: Códec, HDR, audio, idiomas, seeders/leechers

### ⚡ Optimizaciones
- **Conexión Reutilizable**: Cliente qBittorrent global (40-50% más rápido)
- **Operaciones Paralelas**: Verificaciones y prioridades concurrentes (10-20x)
- **Código Optimizado**: 24% menos código, más eficiente

---

## 🚀 Guía de Instalación y Despliegue

### 📋 Requisitos Previos

```bash
# Node.js 16 o superior
node --version  # v16.0.0+

# PM2 para producción (opcional pero recomendado)
npm install -g pm2

# qBittorrent con WebUI habilitado
# Cuenta activa en Lat-Team (https://lat-team.com)
# API Key de TMDB (https://www.themoviedb.org/settings/api)
```

### 📥 Paso 1: Clonar e Instalar

```bash
# Clonar repositorio
git clone https://github.com/moisesvmr/s_lt_addon.git
cd s_lt_addon

# Instalar dependencias
npm install
```

### ⚙️ Paso 2: Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar con tus datos
nano .env
```

**Variables importantes:**
```env
# Tokens (OBLIGATORIOS)
LATAM_TOKEN=tu_token_lat_team
TMDB_KEY=tu_api_key_tmdb
ADDON_KEY=clave_secreta_unica
TORRENT_API_KEY=tu_api_key_torrents

# Dominio público (para Stremio)
DOMAIN=http://tu-servidor.com:4000

# qBittorrent
QBIT_HOST=http://localhost:8080
QBIT_USER=admin
QBIT_PASS=tu_password

# Torrent Settings
TORRENT_MOVIES_PATH=/datos/videosc/movies  #directorio para peliculas en qbittorrent
TORRENT_SERIES_PATH=/datos/videosc/series  #directorio para series en qbittorrent

# Stream API
STREAM_API_URL=http://localhost:9443/video
STREAM_API_TOKEN=Bearer tu_token
STREAM_API_VERIFY_SSL=true

# Servidor
PORT=4000
HOST=0.0.0.0
```

### 🔧 Paso 3: Ejecutar con PM2 (Producción)

#### Instalación básica:

```bash
# Iniciar con PM2
pm2 start src/index.js --name "stremio-latam"

# Ver logs
pm2 logs stremio-latam

# Ver estado
pm2 status
```

## 📝 Logs

Los logs muestran:
- ✅ Conexiones exitosas
- ⚠️ Advertencias
- ❌ Errores
- 📊 Estadísticas de cache
- 🔍 Búsquedas de torrents
- ⚡ Hits de cache

## 🛠️ Tecnologías

- **[Fastify](https://www.fastify.io/)** - Framework web rápido
- **[Axios](https://axios-http.com/)** - Cliente HTTP
- **[qBittorrent API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1))** - Control de torrents
- **[TMDB API](https://www.themoviedb.org/documentation/api)** - Conversión IMDB↔TMDB
- **[Lat-Team API](https://lat-team.com)** - Tracker de torrents


## ⭐ Agradecimientos

- [Stremio](https://www.stremio.com/) - Plataforma de streaming
- [Lat-Team](https://lat-team.com) - Tracker de torrents
- Comunidad de desarrolladores de addons de Stremio

---

**Desarrollado con ❤️ para la comunidad de Stremio**
