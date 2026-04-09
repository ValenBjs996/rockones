export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Nota de crédito'];

export const DB = {

    init() {
        if (!localStorage.getItem('clientes'))  localStorage.setItem('clientes',  JSON.stringify([]));
        if (!localStorage.getItem('productos')) localStorage.setItem('productos', JSON.stringify([]));
        if (!localStorage.getItem('ventas'))    localStorage.setItem('ventas',    JSON.stringify([]));
        if (!localStorage.getItem('pedidos'))   localStorage.setItem('pedidos',   JSON.stringify([]));
        this._migrar();
    },

    _migrar() {
        // Clientes: movimientos + tipoPrecio
        const clientes = this.get('clientes');
        let dirtyC = false;
        clientes.forEach(c => {
            if (!Array.isArray(c.movimientos)) { c.movimientos = []; dirtyC = true; }
            if (!c.tipoPrecio)                 { c.tipoPrecio  = 'minorista'; dirtyC = true; }
        });
        if (dirtyC) this.save('clientes', clientes);

        // Productos: precioMayorista
        const productos = this.get('productos');
        let dirtyP = false;
        productos.forEach(p => {
            if (p.precioMayorista === undefined) { p.precioMayorista = p.precio; dirtyP = true; }
        });
        if (dirtyP) this.save('productos', productos);
    },

    get(collection)        { return JSON.parse(localStorage.getItem(collection)) || []; },
    save(collection, data) { localStorage.setItem(collection, JSON.stringify(data)); },
    generateId()           { return Date.now().toString(36) + Math.random().toString(36).substr(2); },

    getById(collection, id) { return this.get(collection).find(i => i.id === id); },

    add(collection, item) {
        const data     = this.get(collection);
        item.id        = this.generateId();
        item.createdAt = new Date().toISOString();
        data.push(item);
        this.save(collection, data);
        return item;
    },

    update(collection, id, newData) {
        const data = this.get(collection);
        const idx  = data.findIndex(i => i.id === id);
        if (idx !== -1) {
            data[idx] = { ...data[idx], ...newData, updatedAt: new Date().toISOString() };
            this.save(collection, data);
        }
    },

    delete(collection, id) {
        this.save(collection, this.get(collection).filter(i => i.id !== id));
    },

    getPrecioParaCliente(producto, tipoPrecio) {
        if (tipoPrecio === 'mayorista' && producto.precioMayorista != null) {
            return Number(producto.precioMayorista);
        }
        return Number(producto.precio);
    },

    // ── VENTAS ──────────────────────────────────────────────────────

    crearVenta(ventaData) {
        const productos = this.get('productos');
        const clientes  = this.get('clientes');

        // 1. Verificar stock, descontar y enriquecer items
        ventaData.items.forEach(item => {
            const idx = productos.findIndex(p => p.id === item.productoId);
            if (idx === -1 || productos[idx].stock < item.cantidad) {
                throw new Error(`Stock insuficiente para "${item.nombreProducto || 'el producto'}".`);
            }
            if (!item.nombreProducto)  item.nombreProducto  = productos[idx].nombre;
            if (!item.precioUnitario)  item.precioUnitario  = Number(productos[idx].precio);
            productos[idx].stock -= item.cantidad;
        });
        this.save('productos', productos);

        // 2. Saldo pendiente
        const total          = Number(ventaData.total);
        const montoPagado    = Number(ventaData.montoPagado) || 0;
        const saldoPendiente = Math.max(0, total - montoPagado);
        const descuento      = Number(ventaData.descuento)   || 0;
        const metodoPago     = ventaData.metodoPago          || 'Efectivo';

        // 3. Cuenta corriente del cliente
        if (ventaData.clienteId) {
            const cidx = clientes.findIndex(c => c.id === ventaData.clienteId);
            if (cidx !== -1) {
                if (saldoPendiente > 0) {
                    clientes[cidx].deuda = (Number(clientes[cidx].deuda) || 0) + saldoPendiente;
                }
                if (!Array.isArray(clientes[cidx].movimientos)) clientes[cidx].movimientos = [];
                const itemsDesc = ventaData.items.map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
                clientes[cidx].movimientos.push({
                    id:          this.generateId(),
                    tipo:        'cargo',
                    cargo:       total,
                    abono:       montoPagado,
                    descripcion: `Venta: ${itemsDesc}${descuento ? ` (${descuento}% dto.)` : ''}`,
                    metodoPago,
                    fecha:       new Date().toISOString(),
                });
                this.save('clientes', clientes);
            }
        }

        const estado = saldoPendiente <= 0 ? 'pagado' : 'pendiente';
        return this.add('ventas', { ...ventaData, total, montoPagado, saldoPendiente, estado, descuento, metodoPago });
    },

    eliminarVenta(ventaId) {
        const venta = this.getById('ventas', ventaId);
        if (!venta) return;

        const productos = this.get('productos');
        const clientes  = this.get('clientes');

        venta.items.forEach(item => {
            const idx = productos.findIndex(p => p.id === item.productoId);
            if (idx !== -1) productos[idx].stock += item.cantidad;
        });

        if (venta.saldoPendiente > 0 && venta.clienteId) {
            const cidx = clientes.findIndex(c => c.id === venta.clienteId);
            if (cidx !== -1) {
                clientes[cidx].deuda = Math.max(0, (clientes[cidx].deuda || 0) - venta.saldoPendiente);
                if (!Array.isArray(clientes[cidx].movimientos)) clientes[cidx].movimientos = [];
                clientes[cidx].movimientos.push({
                    id:          this.generateId(),
                    tipo:        'ajuste',
                    cargo:       0,
                    abono:       venta.saldoPendiente,
                    descripcion: 'Anulación de venta',
                    fecha:       new Date().toISOString(),
                });
                this.save('clientes', clientes);
            }
        }

        this.save('productos', productos);
        this.delete('ventas', ventaId);
    },

    // ── PEDIDOS ─────────────────────────────────────────────────────

    crearPedido(pedidoData) {
        return this.add('pedidos', { ...pedidoData, estado: 'pendiente' });
    },

    actualizarEstadoPedido(pedidoId, estado) { this.update('pedidos', pedidoId, { estado }); },
    cancelarPedido(pedidoId)                  { this.update('pedidos', pedidoId, { estado: 'cancelado' }); },
    eliminarPedido(pedidoId)                  { this.delete('pedidos', pedidoId); },

    convertirPedidoAVenta(pedidoId, montoPagado, metodoPago) {
        const pedido = this.getById('pedidos', pedidoId);
        if (!pedido) throw new Error('Pedido no encontrado.');

        // Copia los items para no mutar el pedido
        const items = (pedido.items || []).map(i => ({ ...i }));

        const venta = this.crearVenta({
            clienteId:   pedido.clienteId || null,
            items,
            total:       pedido.total,
            montoPagado: Number(montoPagado) || 0,
            metodoPago:  metodoPago || 'Efectivo',
            notas:       `Pedido #${pedido.id.slice(-5).toUpperCase()}${pedido.notas ? ' — ' + pedido.notas : ''}`,
            descuento:   pedido.descuento || 0,
        });

        this.update('pedidos', pedidoId, { estado: 'entregado', ventaId: venta.id });
        return venta;
    },

    // ── CUENTA CORRIENTE ────────────────────────────────────────────

    registrarPago(clienteId, monto, descripcion, metodoPago) {
        const clientes = this.get('clientes');
        const idx      = clientes.findIndex(c => c.id === clienteId);
        if (idx === -1) return;

        if (!Array.isArray(clientes[idx].movimientos)) clientes[idx].movimientos = [];
        clientes[idx].movimientos.push({
            id:          this.generateId(),
            tipo:        'abono',
            cargo:       0,
            abono:       monto,
            descripcion: descripcion || 'Pago',
            metodoPago:  metodoPago || 'Efectivo',
            fecha:       new Date().toISOString(),
        });
        clientes[idx].deuda = Math.max(0, (Number(clientes[idx].deuda) || 0) - monto);
        this.save('clientes', clientes);
    },

    // ── ESTADÍSTICAS ────────────────────────────────────────────────

    getStats() {
        const ventas   = this.get('ventas');
        const clientes = this.get('clientes');
        const pedidos  = this.get('pedidos');

        // Últimos 7 días
        const dias = [];
        for (let i = 6; i >= 0; i--) {
            const d       = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dVentas = ventas.filter(v => v.createdAt.startsWith(dateStr));
            dias.push({
                label: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
                total: dVentas.reduce((s, v) => s + Number(v.total), 0),
                count: dVentas.length,
            });
        }

        // Top productos (por unidades vendidas)
        const prodMap = {};
        ventas.forEach(v => {
            (v.items || []).forEach(item => {
                const key = item.productoId || item.nombreProducto;
                if (!prodMap[key]) prodMap[key] = { nombre: item.nombreProducto || '?', unidades: 0 };
                prodMap[key].unidades += Number(item.cantidad);
            });
        });
        const topProductos = Object.values(prodMap)
            .sort((a, b) => b.unidades - a.unidades)
            .slice(0, 5);

        // Mes actual
        const mesActual    = new Date().toISOString().slice(0, 7);
        const ventasMes    = ventas.filter(v => v.createdAt.startsWith(mesActual));
        const cobradoMes   = ventasMes.reduce((s, v) => s + Number(v.montoPagado),    0);
        const pendienteMes = ventasMes.reduce((s, v) => s + Number(v.saldoPendiente), 0);
        const totalMes     = ventasMes.reduce((s, v) => s + Number(v.total),          0);

        // Métodos de pago (todas las ventas)
        const metodosMap = {};
        ventas.forEach(v => {
            const m = v.metodoPago || 'Efectivo';
            metodosMap[m] = (metodosMap[m] || 0) + 1;
        });
        const totalMetodos = Math.max(Object.values(metodosMap).reduce((s, n) => s + n, 0), 1);
        const metodosArr   = Object.entries(metodosMap)
            .sort((a, b) => b[1] - a[1])
            .map(([m, n]) => ({ metodo: m, count: n, pct: Math.round(n / totalMetodos * 100) }));

        // Top deudores
        const topDeudores = [...clientes]
            .filter(c => (c.deuda || 0) > 0)
            .sort((a, b) => b.deuda - a.deuda)
            .slice(0, 5);

        // Pedidos del mes
        const pedidosMes  = pedidos.filter(p => p.createdAt.startsWith(mesActual));
        const pedidosStats = {
            total:      pedidosMes.length,
            pendientes: pedidosMes.filter(p => p.estado === 'pendiente' || p.estado === 'listo').length,
            entregados: pedidosMes.filter(p => p.estado === 'entregado').length,
            cancelados: pedidosMes.filter(p => p.estado === 'cancelado').length,
        };

        return { dias, topProductos, cobradoMes, pendienteMes, totalMes, metodosArr, topDeudores, pedidosStats };
    },
};
