// api/stripe-webhook.js
// Webhook de Stripe para procesar pagos automáticamente
// Despliega esto en tu proyecto de Vercel (algoritmo-admin)

import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://csjmiwfcqyvtiugywaof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Usa la SERVICE KEY, no la anon key

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración de productos de Stripe (mapeo de price_id a créditos)
const PRODUCTOS_STRIPE = {
    // Packs de créditos
    'price_pack_10': { creditos: 10, monto: 8.50, tipo: 'pack_10' },
    'price_pack_25': { creditos: 25, monto: 21.25, tipo: 'pack_25' },
    'price_pack_50': { creditos: 50, monto: 42.50, tipo: 'pack_50' },
    
    // Créditos individuales
    'price_standard': { creditos: 1.5, monto: 1.50, tipo: 'credito_standard' },
    'price_premium': { creditos: 3, monto: 3.00, tipo: 'credito_premium' },
    
    // Mapeo por monto (fallback si no hay price_id)
    '8.50': { creditos: 10, monto: 8.50, tipo: 'pack_10' },
    '21.25': { creditos: 25, monto: 21.25, tipo: 'pack_25' },
    '42.50': { creditos: 50, monto: 42.50, tipo: 'pack_50' },
    '1.50': { creditos: 1.5, monto: 1.50, tipo: 'credito_standard' },
    '1.5': { creditos: 1.5, monto: 1.50, tipo: 'credito_standard' },
    '3.00': { creditos: 3, monto: 3.00, tipo: 'credito_premium' },
    '3': { creditos: 3, monto: 3.00, tipo: 'credito_premium' },
};

export default async function handler(req, res) {
    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const event = req.body;
        
        console.log('📨 Webhook recibido:', event.type);

        // Procesar solo eventos de pago completado
        if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
            await procesarPago(event);
        }

        res.status(200).json({ received: true });
        
    } catch (error) {
        console.error('❌ Error en webhook:', error);
        res.status(500).json({ error: error.message });
    }
}

async function procesarPago(event) {
    let email, monto, priceId, customerName;
    
    // Extraer datos según el tipo de evento
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        email = session.customer_email || session.customer_details?.email;
        monto = (session.amount_total / 100).toFixed(2); // Convertir de centavos a euros
        customerName = session.customer_details?.name;
        
        // Intentar obtener el price_id de los line_items
        if (session.line_items?.data?.[0]?.price?.id) {
            priceId = session.line_items.data[0].price.id;
        }
        
        console.log('💳 Checkout completado:', { email, monto, customerName });
        
    } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        email = paymentIntent.receipt_email || paymentIntent.metadata?.email;
        monto = (paymentIntent.amount / 100).toFixed(2);
        
        console.log('💳 Payment Intent exitoso:', { email, monto });
    }

    if (!email) {
        console.log('⚠️ No se encontró email en el evento');
        return;
    }

    // Determinar producto por price_id o por monto
    let producto = PRODUCTOS_STRIPE[priceId] || PRODUCTOS_STRIPE[monto];
    
    if (!producto) {
        console.log('⚠️ Producto no reconocido. Monto:', monto);
        // Asumir créditos = monto si no se reconoce
        producto = {
            creditos: parseFloat(monto),
            monto: parseFloat(monto),
            tipo: 'desconocido'
        };
    }

    console.log('📦 Producto identificado:', producto);

    // Buscar usuario por email
    const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('id, email, nombre, creditos, creditos_bienvenida, codigo_afiliado_usado')
        .eq('email', email.toLowerCase())
        .single();

    if (userError || !usuario) {
        // Intentar buscar sin case-sensitive
        const { data: usuario2, error: userError2 } = await supabase
            .from('usuarios')
            .select('id, email, nombre, creditos, creditos_bienvenida, codigo_afiliado_usado')
            .ilike('email', email)
            .single();
            
        if (userError2 || !usuario2) {
            console.log('⚠️ Usuario no encontrado:', email);
            
            // Registrar pago huérfano para revisión manual
            await supabase.from('compras_creditos').insert([{
                usuario_id: null,
                monto: producto.monto,
                creditos_comprados: producto.creditos,
                tipo_paquete: producto.tipo,
                metodo_pago: 'stripe_webhook',
                estado: 'pendiente_usuario',
                notas: `Email no encontrado: ${email}`
            }]);
            
            return;
        }
        
        // Usar usuario2 si se encontró
        Object.assign(usuario, usuario2);
    }

    console.log('👤 Usuario encontrado:', usuario.nombre, usuario.email);

    // Calcular nuevos créditos (se suman a créditos COMPRADOS, no bienvenida)
    const creditosActuales = parseFloat(usuario.creditos) || 0;
    const nuevosCreditos = creditosActuales + producto.creditos;

    // Actualizar créditos del usuario
    const { error: updateError } = await supabase
        .from('usuarios')
        .update({ creditos: nuevosCreditos })
        .eq('id', usuario.id);

    if (updateError) {
        console.error('❌ Error actualizando créditos:', updateError);
        throw updateError;
    }

    console.log('✅ Créditos actualizados:', creditosActuales, '→', nuevosCreditos);

    // Registrar la compra
    const codigoAfiliado = usuario.codigo_afiliado_usado;
    const comisionAfiliado = codigoAfiliado ? (producto.monto * 0.15) : 0;

    const { error: insertError } = await supabase
        .from('compras_creditos')
        .insert([{
            usuario_id: usuario.id,
            monto: producto.monto,
            creditos_comprados: producto.creditos,
            tipo_paquete: producto.tipo,
            metodo_pago: 'stripe_webhook',
            codigo_afiliado_usado: codigoAfiliado,
            comision_afiliado: comisionAfiliado,
            estado: 'completado'
        }]);

    if (insertError) {
        console.error('⚠️ Error registrando compra (no crítico):', insertError);
    }

    // Crear notificación para el usuario
    await supabase.from('notificaciones').insert([{
        usuario_id: usuario.id,
        tipo: 'compra_creditos',
        titulo: '💰 Créditos añadidos',
        mensaje: `Se han añadido ${producto.creditos} créditos a tu cuenta. ¡Ya puedes enviar tu música!`,
        leida: false
    }]);

    console.log('🎉 Compra procesada correctamente para', usuario.email);
}

// Configuración para Vercel - deshabilitar body parser para webhooks
export const config = {
    api: {
        bodyParser: true,
    },
};
