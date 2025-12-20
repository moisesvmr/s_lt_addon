const axios = require('axios');

/**
 * Obtener información del usuario del tracker
 */
async function obtenerInfoUsuario(token) {
  try {
    const url = `https://lat-team.com/api/user?api_token=${token}`;
    const response = await axios.get(url);
    
    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.log(`Error obteniendo info del usuario: ${error.message}`);
    return null;
  }
}

module.exports = {
  obtenerInfoUsuario
};
