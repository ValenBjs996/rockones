import { firebaseConfig } from './firebase-config.js';

// ── Firebase SDK (módulos ES) ────────────────────────────
import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
    getFirestore, doc, getDoc, setDoc, deleteDoc,
    collection, getDocs, enableIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Constantes de negocio ────────────────────────────────
export const METODOS_PAGO   = ['Efectivo', 'Transferencia', 'Débito', 'Nota de crédito'];
export const CANALES_ORIGEN = ['Mostrador', 'WhatsApp', 'Instagram', 'PedidosYa', 'Rappi', 'Otro'];

// ── Init Firebase ─────────────────────────────────────────
const _app = initializeApp(firebaseConfig);
const _db  = getFirestore(_app);

// Persistencia offline (IndexedDB) — funciona sin internet
enableIndexedDbPersistence(_db).catch(() => {});

// ── Indicador visual de sync ─────────────────────────────
function setSyncIcon(spinning) {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.style.animation = spinning ? 'spin 1s linear infinite' : '';
}
if (!document.getElementById('_spin-style')) {
    const st = document.createElement('style');
    st.id = '_spin-style';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
}

// ── Helpers Firestore ─────────────────────────────────────
const COL = (name) => collection(_db, name);
const DOC = (col, id) => doc(_db, col, id);

async function fsGet(colName) {
    const snap = await getDocs(COL(colName));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

async function fsSet(colName, item) {
    await setDoc(DOC(colName, item.id), item);
}

async function fsDel(colName, id) {
    await deleteDoc(DOC(colName, id));
}

// ── Sync: Firebase → localStorage ────────────────────────
export async function syncFromCloud() {
    setSyncIcon(true);
    try {
        for (const col of ['clientes', 'productos', 'ventas', 'pedidos']) {
            const data = await fsGet(col);
            localStorage.setItem(col, JSON.stringify(data));
        }
        localStorage.setItem('_lastSync', new Date().toISOString());
    } catch (e) {
        console.warn('Sync desde nube falló (modo offline):', e.message);
    } finally {
        setSyncIcon(false);
    }
}

// ── Sync: localStorage → Firebase (un ítem) ──────────────
async function pushItem(colName, item) {
    try {
        await fsSet(colName, item);
    } catch (e) {
        console.warn(`Push ${colName}/${item.id} falló (offline):`, e.message);
    }
}

async function deleteItem(colName, id) {
    try {
        await fsDel(colName, id);
    } catch (e) {
        console.warn(`Delete ${colName}/${id} falló (offline):`, e.message);
    }
}

// ════════════════════════════════════════════════════════════
//  DB — igual interfaz que antes, ahora persiste en Firebase
// ════════════════════════════════════════════════════════════
export const DB = {

    init() {
        if (!localStorage.getItem('clientes'))  localStorage.setItem('clientes',  JSON.stringify([]));
        if (!localStorage.getItem('productos')) localStorage.setItem('productos', JSON.stringify([]));
        if (!localStorage.getItem('ventas'))    localStorage.setItem('ventas',    JSON.stringify([]));
        if (!localStorage.getItem('pedidos'))   localStorage.setItem('pedidos',   JSON.stringify([]));
        this._migrar();
        // Sync inicial silencioso
        syncFromCloud();
    },

    _migrar() {
        const clientes = this.get('clientes');
        let dc = false;
        clientes.forEach(c => {
            if (!Array.isArray(c.movimientos)) { c.movimientos = []; dc = true; }
            if (!c.tipoPrecio)                 { c.tipoPrecio  = 'minorista'; dc = true; }
        });
        if (dc) this.save('clientes', clientes);

        const productos = this.get('productos');
        let dp = false;
        productos.forEach(p => {
            if (p.precioMayorista === undefined) { p.precioMayorista = p.precio; dp = true; }
        });
        if (dp) this.save('productos', productos);

        const ventas = this.get('ventas');
        let dv = false;
        ventas.forEach(v => { if (!v.canal) { v.canal = 'Mostrador'; dv = true; } });
        if (dv) this.save('ventas', ventas);

        const pedidos = this.get('pedidos');
        let ped = false;
        pedidos.forEach(p => { if (!p.canal) { p.canal = 'WhatsApp'; ped = true; } });
        if (ped) this.save('pedidos', pedidos);
    },

    // ── CRUD base ──────────────────────────────────────────

    get(col)        { return JSON.parse(localStorage.getItem(col)) || []; },
    save(col, data) { localStorage.setItem(col, JSON.stringify(data)); },
    generateId()    { return Date.now().toString(36) + Math.random().toString(36).substr(2); },
    getById(col, id){ return this.get(col).find(i => i.id === id); },

    add(col, item) {
        const data     = this.get(col);
        item.id        = item.id        || this.generateId();
        item.createdAt = item.createdAt || new Date().toISOString();
        data.push(item);
        this.save(col, data);
        pushItem(col, item);
        return item;
    },

    update(col, id, newData) {
        const data = this.get(col);
        const idx  = data.findIndex(i => i.id === id);
        if (idx !== -1) {
            data[idx] = { ...data[idx], ...newData, updatedAt: new Date().toISOString() };
            this.save(col, data);
            pushItem(col, data[idx]);
        }
    },

    delete(col, id) {
        this.save(col, this.get(col).filter(i => i.id !== id));
        deleteItem(col, id);
    },

    getPrecioParaCliente(producto, tipoPrecio) {
        if (tipoPrecio === 'mayorista' && producto.precioMayorista != null)
            return Number(producto.precioMayorista);
        return Number(producto.precio);
    },

    // ── VENTAS ─────────────────────────────────────────────

    crearVenta(ventaData) {
        const productos = this.get('productos');
        const clientes  = this.get('clientes');

        ventaData.items.forEach(item => {
            const idx = productos.findIndex(p => p.id === item.productoId);
            if (idx === -1 || productos[idx].stock < item.cantidad)
                throw new Error(`Stock insuficiente para "${item.nombreProducto || 'el producto'}".`);
            if (!item.nombreProducto) item.nombreProducto = productos[idx].nombre;
            if (!item.precioUnitario) item.precioUnitario = Number(productos[idx].precio);
            productos[idx].stock -= item.cantidad;
        });
        this.save('productos', productos);
        productos.forEach(p => pushItem('productos', p));

        const total          = Number(ventaData.total);
        const montoPagado    = Number(ventaData.montoPagado) || 0;
        const saldoPendiente = Math.max(0, total - montoPagado);
        const descuento      = Number(ventaData.descuento)   || 0;
        const metodoPago     = ventaData.metodoPago          || 'Efectivo';
        const canal          = ventaData.canal               || 'Mostrador';

        if (ventaData.clienteId) {
            const cidx = clientes.findIndex(c => c.id === ventaData.clienteId);
            if (cidx !== -1) {
                if (saldoPendiente > 0)
                    clientes[cidx].deuda = (Number(clientes[cidx].deuda) || 0) + saldoPendiente;
                if (!Array.isArray(clientes[cidx].movimientos)) clientes[cidx].movimientos = [];
                const itemsDesc = ventaData.items.map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
                clientes[cidx].movimientos.push({
                    id: this.generateId(), tipo: 'cargo',
                    cargo: total, abono: montoPagado,
                    descripcion: `Venta: ${itemsDesc}${descuento ? ` (${descuento}% dto.)` : ''}`,
                    metodoPago, canal, fecha: new Date().toISOString(),
                });
                this.save('clientes', clientes);
                pushItem('clientes', clientes[cidx]);
            }
        }

        const estado = saldoPendiente <= 0 ? 'pagado' : 'pendiente';
        return this.add('ventas', { ...ventaData, total, montoPagado, saldoPendiente, estado, descuento, metodoPago, canal });
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
                    id: this.generateId(), tipo: 'ajuste',
                    cargo: 0, abono: venta.saldoPendiente,
                    descripcion: 'Anulación de venta', fecha: new Date().toISOString(),
                });
                this.save('clientes', clientes);
                pushItem('clientes', clientes[cidx]);
            }
        }

        this.save('productos', productos);
        productos.forEach(p => pushItem('productos', p));
        this.delete('ventas', ventaId);
    },

    // ── PEDIDOS ────────────────────────────────────────────

    crearPedido(pedidoData) {
        return this.add('pedidos', { ...pedidoData, estado: 'pendiente' });
    },

    actualizarEstadoPedido(id, estado) { this.update('pedidos', id, { estado }); },
    cancelarPedido(id)                  { this.update('pedidos', id, { estado: 'cancelado' }); },
    eliminarPedido(id)                  { this.delete('pedidos', id); },

    convertirPedidoAVenta(pedidoId, montoPagado, metodoPago) {
        const pedido = this.getById('pedidos', pedidoId);
        if (!pedido) throw new Error('Pedido no encontrado.');
        const items = (pedido.items || []).map(i => ({ ...i }));
        const venta = this.crearVenta({
            clienteId:   pedido.clienteId || null,
            items,
            total:       pedido.total,
            montoPagado: Number(montoPagado) || 0,
            metodoPago:  metodoPago || 'Efectivo',
            canal:       pedido.canal || 'WhatsApp',
            notas:       `Pedido #${pedido.id.slice(-5).toUpperCase()}${pedido.notas ? ' — ' + pedido.notas : ''}`,
            descuento:   pedido.descuento || 0,
        });
        this.update('pedidos', pedidoId, { estado: 'entregado', ventaId: venta.id });
        return venta;
    },

    // ── CUENTA CORRIENTE ───────────────────────────────────

    registrarPago(clienteId, monto, descripcion, metodoPago) {
        const clientes = this.get('clientes');
        const idx      = clientes.findIndex(c => c.id === clienteId);
        if (idx === -1) return;
        if (!Array.isArray(clientes[idx].movimientos)) clientes[idx].movimientos = [];
        clientes[idx].movimientos.push({
            id: this.generateId(), tipo: 'abono',
            cargo: 0, abono: monto,
            descripcion: descripcion || 'Pago',
            metodoPago: metodoPago || 'Efectivo',
            fecha: new Date().toISOString(),
        });
        clientes[idx].deuda = Math.max(0, (Number(clientes[idx].deuda) || 0) - monto);
        this.save('clientes', clientes);
        pushItem('clientes', clientes[idx]);
    },

    // ── ESTADÍSTICAS ───────────────────────────────────────

    getStats() {
        const ventas   = this.get('ventas');
        const clientes = this.get('clientes');
        const pedidos  = this.get('pedidos');

        const dias = [];
        for (let i = 6; i >= 0; i--) {
            const d   = new Date(); d.setDate(d.getDate() - i);
            const str = d.toISOString().split('T')[0];
            const dV  = ventas.filter(v => v.createdAt.startsWith(str));
            dias.push({
                label: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
                total: dV.reduce((s, v) => s + Number(v.total), 0),
                count: dV.length,
            });
        }

        const prodMap = {};
        ventas.forEach(v => (v.items || []).forEach(item => {
            const k = item.productoId || item.nombreProducto;
            if (!prodMap[k]) prodMap[k] = { nombre: item.nombreProducto || '?', unidades: 0, total: 0 };
            prodMap[k].unidades += Number(item.cantidad);
            prodMap[k].total    += Number(item.precioUnitario || 0) * Number(item.cantidad);
        }));
        const topProductos = Object.values(prodMap).sort((a, b) => b.unidades - a.unidades).slice(0, 5);

        const mes          = new Date().toISOString().slice(0, 7);
        const ventasMes    = ventas.filter(v => v.createdAt.startsWith(mes));
        const cobradoMes   = ventasMes.reduce((s, v) => s + Number(v.montoPagado),    0);
        const pendienteMes = ventasMes.reduce((s, v) => s + Number(v.saldoPendiente), 0);
        const totalMes     = ventasMes.reduce((s, v) => s + Number(v.total),          0);

        const metodosMap = {};
        ventas.forEach(v => {
            const m = v.metodoPago || 'Efectivo';
            if (!metodosMap[m]) metodosMap[m] = { count: 0, total: 0 };
            metodosMap[m].count++; metodosMap[m].total += Number(v.total);
        });
        const totalMet = Math.max(Object.values(metodosMap).reduce((s, m) => s + m.count, 0), 1);
        const metodosArr = Object.entries(metodosMap)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([metodo, d]) => ({ metodo, count: d.count, total: d.total, pct: Math.round(d.count / totalMet * 100) }));

        const canalesMap = {};
        ventas.forEach(v => {
            const c = v.canal || 'Mostrador';
            if (!canalesMap[c]) canalesMap[c] = { count: 0, total: 0, cobrado: 0 };
            canalesMap[c].count++; canalesMap[c].total += Number(v.total); canalesMap[c].cobrado += Number(v.montoPagado);
        });
        const totalCan = Math.max(Object.values(canalesMap).reduce((s, c) => s + c.count, 0), 1);
        const canalesArr = Object.entries(canalesMap)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([canal, d]) => ({ canal, count: d.count, total: d.total, cobrado: d.cobrado, pct: Math.round(d.count / totalCan * 100) }));

        const topDeudores   = [...clientes].filter(c => (c.deuda || 0) > 0).sort((a, b) => b.deuda - a.deuda).slice(0, 5);
        const pedidosMes    = pedidos.filter(p => p.createdAt.startsWith(mes));
        const pedidosStats  = {
            total:      pedidosMes.length,
            pendientes: pedidosMes.filter(p => p.estado === 'pendiente' || p.estado === 'listo').length,
            entregados: pedidosMes.filter(p => p.estado === 'entregado').length,
            cancelados: pedidosMes.filter(p => p.estado === 'cancelado').length,
        };

        return { dias, topProductos, cobradoMes, pendienteMes, totalMes, metodosArr, canalesArr, topDeudores, pedidosStats };
    },

    // ── CIERRE DE CAJA ─────────────────────────────────────

    getCierreCaja(fecha) {
        const dateStr  = fecha || new Date().toISOString().split('T')[0];
        const ventas   = this.get('ventas').filter(v => v.createdAt.startsWith(dateStr));
        const clientes = this.get('clientes');
        const pedidos  = this.get('pedidos').filter(p =>
            p.estado === 'entregado' && (p.updatedAt || p.createdAt || '').startsWith(dateStr));

        const totalBruto     = ventas.reduce((s, v) => s + Number(v.total),          0);
        const totalCobrado   = ventas.reduce((s, v) => s + Number(v.montoPagado),    0);
        const totalPendiente = ventas.reduce((s, v) => s + Number(v.saldoPendiente), 0);

        const porMetodo = {};
        ventas.forEach(v => {
            const m = v.metodoPago || 'Efectivo';
            if (!porMetodo[m]) porMetodo[m] = { cobrado: 0, count: 0 };
            porMetodo[m].cobrado += Number(v.montoPagado); porMetodo[m].count++;
        });

        const porCanal = {};
        ventas.forEach(v => {
            const c = v.canal || 'Mostrador';
            if (!porCanal[c]) porCanal[c] = { total: 0, cobrado: 0, count: 0 };
            porCanal[c].total += Number(v.total); porCanal[c].cobrado += Number(v.montoPagado); porCanal[c].count++;
        });

        const detalleVentas = ventas.map(v => {
            const c = clientes.find(cl => cl.id === v.clienteId);
            return { ...v, clienteNombre: c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Consumidor final' };
        });

        return { fecha: dateStr, cantVentas: ventas.length, totalBruto, totalCobrado, totalPendiente, porMetodo, porCanal, detalleVentas, pedidosEntregados: pedidos.length };
    },
};
