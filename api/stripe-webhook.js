import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wesmqgaijlmqhctrtaje.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc21xZ2FpamxtcWhjdHJ0YWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxNzI4MTcsImV4cCI6MjA1Mzc0ODgxN30.Yp1P3FoLMdcFmjOXfbMFyLSq0E_QaGRKPbwWNPFDWlI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const config = {
    api: {
        bodyParser: false,
    },
};

async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const buf = await buffer(req);
        const payload = buf.toString();
        const event = JSON.parse(payload);

        console.log('Webhook recibido:', event.type);

        // Procesar evento de pago completado
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const metadata = session.metadata || {};

            console.log('Pago completado:', session.id);
            console.log('Metadata:', metadata);

            // Verificar si es un pago de destacar playlist
            if (metadata.tipo === 'destacar_playlist') {
                const playlistId = metadata.playlist_id;
                const curadorId = metadata.curador_id;
                const curadorNombre = metadata.curador_nombre;
                const curadorEmail = metadata.curador_email;
                const playlistNombre = metadata.playlist_nombre;

                console.log('Procesando destacar playlist:', playlistId);

                // 1. Marcar playlist como destacada
                const { error: errorPlaylist } = await supabase
                    .from('playlists')
                    .update({ 
                        destacada: true,
                        fecha_destacada: new Date().toISOString()
                    })
                    .eq('id', playlistId);

                if (errorPlaylist) {
                    console.error('Error actualizando playlist:', errorPlaylist);
                }

                // 2. Guardar registro en solicitudes_destacar
                const { error: errorSolicitud } = await supabase
                    .from('solicitudes_destacar')
                    .insert({
                        curador_id: curadorId,
                        curador_nombre: curadorNombre,
                        curador_email: curadorEmail,
                        playlist_id: playlistId,
                        playlist_nombre: playlistNombre,
                        precio: 14.99,
                        estado: 'aprobado',
                        aprobado_at: new Date().toISOString(),
                        stripe_session_id: session.id,
                        stripe_payment_intent: session.payment_intent
                    });

                if (errorSolicitud) {
                    console.error('Error guardando solicitud:', errorSolicitud);
                }

                // 3. Registrar transacción
                const { error: errorTransaccion } = await supabase
                    .from('transacciones')
                    .insert({
                        usuario_id: curadorId,
                        tipo: 'destacar_playlist',
                        monto: 14.99,
                        estado: 'completado',
                        referencia: session.id,
                        descripcion: `Destacar playlist: ${playlistNombre}`
                    });

                if (errorTransaccion) {
                    console.error('Error guardando transacción:', errorTransaccion);
                }

                console.log('Playlist destacada correctamente');
            }
        }

        res.status(200).json({ received: true });

    } catch (err) {
        console.error('Error en webhook:', err);
        res.status(400).json({ error: err.message });
    }
}
