const https = require('https');

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, nombre, codigo, link } = req.body || {};

    if (!email || !nombre || !codigo || !link) {
        return res.status(400).json({ error: 'Faltan parámetros', received: req.body });
    }

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 15px; text-align: center; color: white;">
                <h1>🎉 ¡Felicidades ${nombre}!</h1>
                <p>Tu solicitud de afiliado ha sido aprobada</p>
            </div>
            <div style="padding: 30px; background: #f8f9fa;">
                <h2 style="color: #333;">Tu código: <span style="color: #667eea;">${codigo}</span></h2>
                <p><strong>Tu link personalizado:</strong></p>
                <p><a href="${link}" style="color: #10b981;">${link}</a></p>
                <h3>💰 ¿Cómo funciona?</h3>
                <ul>
                    <li>Comparte tu link con artistas</li>
                    <li>Ganas 15% de comisión en cada compra</li>
                    <li>Ellos obtienen 20% de descuento</li>
                </ul>
            </div>
        </div>
    `;

    const postData = JSON.stringify({
        from: 'Algoritmo en Movimiento <onboarding@resend.dev>',
        to: email,
        subject: '🎉 ¡Bienvenido al Programa de Afiliados!',
        html: emailHtml
    });

    return new Promise((resolve) => {
        const options = {
            hostname: 'api.resend.com',
            port: 443,
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer re_g2hvkESD_6BqXWQeh53P7Auh1iMWk9aMU',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        res.status(200).json({ success: true, data: result });
                    } else {
                        res.status(500).json({ error: result.message || 'Error de Resend', details: result });
                    }
                } catch (e) {
                    res.status(500).json({ error: 'Error parsing response', raw: data });
                }
                resolve();
            });
        });

        request.on('error', (error) => {
            res.status(500).json({ error: error.message });
            resolve();
        });

        request.write(postData);
        request.end();
    });
}
