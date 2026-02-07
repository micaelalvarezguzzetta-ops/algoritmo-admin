const https = require('https');

export default async function handler(req, res) {
    // CORS headers
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
                <h2 style="color: #333;">Tu código de afiliado:</h2>
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 25px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center; margin: 15px 0;">
                    ${codigo}
                </div>
                
                <h3 style="color: #333; margin-top: 25px;">🔗 Tu link personalizado:</h3>
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; word-break: break-all;">
                    <a href="${link}" style="color: #10b981; font-weight: bold;">${link}</a>
                </div>
                
                <h3 style="color: #333; margin-top: 25px;">💰 ¿Cómo funciona?</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li><strong>Comparte tu link</strong> con artistas que quieran promocionar su música</li>
                    <li><strong>Ganas 15% de comisión</strong> en cada compra que hagan</li>
                    <li><strong>Ellos obtienen 20% de descuento</strong> en su primera compra</li>
                    <li><strong>Sin límites:</strong> Cuantos más artistas traigas, más ganas</li>
                </ul>
                
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px;">
                    <strong>💡 Consejo:</strong> Comparte tu link en redes sociales, grupos de música, y con artistas que conozcas.
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="https://algoritmoenmovimiento.com" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: bold;">
                        Ir a mi panel de afiliado
                    </a>
                </div>
            </div>
            <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
                <p>© 2026 Algoritmo en Movimiento - Todos los derechos reservados</p>
            </div>
        </div>
    `;

    const postData = JSON.stringify({
        from: 'Algoritmo en Movimiento <noreply@algoritmoenmovimiento.com>',
        to: email,
        subject: '🎉 ¡Bienvenido al Programa de Afiliados de Algoritmo!',
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
