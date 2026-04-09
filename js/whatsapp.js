export const WhatsApp = {

    formatNumber(phone) {
        if (!phone) return '';
        let num = phone.toString().replace(/\D/g, '');
        if (num.startsWith('0'))  num = num.substring(1);
        if (num.startsWith('15')) num = '9' + num.substring(2);
        if (num.length === 10 && !num.startsWith('549')) num = '549' + num;
        if (!num.startsWith('54')) num = '549' + num;
        return num;
    },

    createLink(phone, message) {
        return `https://wa.me/${this.formatNumber(phone)}?text=${encodeURIComponent(message)}`;
    },

    openChat(phone) {
        if (!phone) return;
        window.open(`https://wa.me/${this.formatNumber(phone)}`, '_blank');
    },

    // ── VENTAS ─────────────────────────────────────────

    sendOrderReady(clientName, phone) {
        if (!phone) return;
        const msg = `Hola ${clientName} 👋, tu pedido está listo para entregar. 🍝`;
        window.open(this.createLink(phone, msg), '_blank');
    },

    sendOrderDetails(clientName, phone, itemsText, total, metodoPago) {
        if (!phone) return;
        const metodo = metodoPago ? `\n💳 Método: ${metodoPago}` : '';
        const msg =
            `Hola ${clientName} 👋\n\n` +
            `✅ *Venta confirmada*\n\n` +
            `📦 ${itemsText}\n` +
            `💰 Total: *$${total}*${metodo}\n\n` +
            `¡Gracias por elegirnos! 🍝`;
        window.open(this.createLink(phone, msg), '_blank');
    },

    sendDebtReminder(clientName, phone, debtAmount) {
        if (!phone) return;
        const msg =
            `Hola ${clientName} 👋\n\n` +
            `Te recordamos que tenés un saldo pendiente de *$${debtAmount}*.\n\n` +
            `Cuando puedas regularizarlo, avisanos. ¡Gracias! 🙏`;
        window.open(this.createLink(phone, msg), '_blank');
    },

    // ── PEDIDOS ────────────────────────────────────────

    sendPedidoConfirmacion(clientName, phone, itemsText, total, fechaEntrega) {
        if (!phone) return;
        const fecha = new Date(fechaEntrega + 'T12:00:00').toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const msg =
            `Hola ${clientName} 👋 ¡Tu pedido fue registrado!\n\n` +
            `📦 *Detalle:*\n${itemsText}\n\n` +
            `💰 Total estimado: *$${total}*\n` +
            `📅 Entrega: *${fecha}*\n\n` +
            `Avisanos si necesitás algún cambio. ¡Gracias! 🍝`;
        window.open(this.createLink(phone, msg), '_blank');
    },

    sendPedidoListo(clientName, phone, itemsText) {
        if (!phone) return;
        const msg =
            `Hola ${clientName} ✅ ¡Tu pedido está listo para retirar!\n\n` +
            `📦 *Detalle:*\n${itemsText}\n\n` +
            `¡Te esperamos! 🍝`;
        window.open(this.createLink(phone, msg), '_blank');
    },

    // ── CUENTA CORRIENTE ───────────────────────────────

    sendResumenDeuda(clientName, phone, movimientos, deuda) {
        if (!phone) return;
        const ultimos = (movimientos || []).slice(-5).reverse();
        const detalle = ultimos.length > 0
            ? ultimos.map(m => {
                const fecha = new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                const metodo = m.metodoPago ? ` · ${m.metodoPago}` : '';
                if (m.cargo > 0) return `📦 ${fecha}: -$${m.cargo} (${m.descripcion}${metodo})`;
                return `💰 ${fecha}: +$${m.abono} (${m.descripcion}${metodo})`;
            }).join('\n')
            : '_Sin movimientos recientes._';

        const msg =
            `Hola ${clientName} 👋\n\n` +
            `📋 *Resumen de cuenta:*\n\n${detalle}\n\n` +
            `*Saldo pendiente: $${deuda}*\n\n` +
            `Cualquier consulta, escribinos. ¡Gracias! 🙏`;
        window.open(this.createLink(phone, msg), '_blank');
    },
};
