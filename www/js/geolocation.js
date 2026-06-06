/**
 * Módulo de Geolocalização - DriverFlux
 * Captura coordenadas GPS durante entrada de dados
 */

const GeoLocation = {
    // Propriedades
    coordenadas: null,
    aguardando: false,

    /**
     * Inicializa o módulo de geolocalização
     */
    init: function() {
        if (!navigator.geolocation) {
            console.error('Geolocalização não suportada neste dispositivo');
            return false;
        }
        return true;
    },

    /**
     * Captura coordenadas GPS atuais
     * @param {Function} callback - Função chamada ao obter coordenadas (lat, lng)
     * @param {Function} onError - Função chamada em caso de erro
     */
    capturarCoordenadas: function(callback, onError) {
        if (!navigator.geolocation) {
            if (onError) onError('Geolocalização não disponível');
            return;
        }

        this.aguardando = true;
        
        // Configurações para forçar o hardware do GPS a responder e ignorar cache antigo
        const opcoes = {
            enableHighAccuracy: true,
            timeout: 15000, // 15 segundos para dar tempo do sistema chamar a permissão nativa
            maximumAge: 0   // Força puxar a localização atual em tempo real
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.aguardando = false;
                const { latitude, longitude, accuracy } = position.coords;
                this.coordenadas = { latitude, longitude, accuracy };
                if (callback) callback(latitude, longitude, accuracy);
            },
            (error) => {
                this.aguardando = false;
                let mensagem = 'Erro ao obter localização';
                
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        mensagem = 'Permissão do GPS negada pelo usuário.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensagem = 'Sinal de GPS indisponível no momento.';
                        break;
                    case error.TIMEOUT:
                        mensagem = 'Tempo esgotado para obter localização.';
                        break;
                }
                
                if (onError) onError(mensagem);
            },
            opcoes
        );
    },

    /**
     * Obtém as coordenadas capturadas
     * @returns {Object} Objeto com latitude, longitude e accuracy
     */
    obterCoordenadas: function() {
        return this.coordenadas;
    },

    /**
     * Verifica se coordenadas estão disponíveis
     * @returns {Boolean}
     */
    temCoordenadas: function() {
        return this.coordenadas !== null;
    },

    /**
     * Limpa as coordenadas armazenadas
     */
    limparCoordenadas: function() {
        this.coordenadas = null;
    },

    /**
     * Formata as coordenadas em string legível
     * @returns {String} Formato: "Lat: X.XXXX, Lng: X.XXXX"
     */
    formatarCoordenadas: function() {
        if (!this.coordenadas) return 'Sem localização';
        const { latitude, longitude } = this.coordenadas;
        return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    },

    /**
     * Retorna as coordenadas como objeto JSON
     * @returns {Object}
     */
    obterJSON: function() {
        return this.coordenadas ? {
            latitude: this.coordenadas.latitude,
            longitude: this.coordenadas.longitude,
            accuracy: this.coordenadas.accuracy,
            timestamp: new Date().toISOString()
        } : null;
    }
};
