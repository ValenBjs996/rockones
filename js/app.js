import { DB, METODOS_PAGO } from './storage.js';
import { WhatsApp }           from './whatsapp.js';

DB.init();

// ── REFERENCIAS DOM ───────────────────────────────────────
const appContent    = document.getElementById('app-content');
const navItems      = document.querySelectorAll('.nav-item');
const appTitle      = document.getElementById('app-title');
const fab           = document.getElementById('fab-add');
const modal         = document.getElementById('modal-container');
const modalBody     = document.getElementById('modal-body');
const modalTitle    = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');

// ── ESTADO DE MÓDULO ──────────────────────────────────────
let currentView      = 'home';
let _homeTab         = 'dashboard';
let _pedidoFiltro    = 'pendiente';
let _pedidoItems     = [];
let _ventaItems      = [];
let _formClienteTipo = 'minorista';

const TITLES = { home: 'Inicio', ventas: 'Ventas', productos: 'Stock', clientes: 'Clientes', pedidos: 'Pedidos' };

// ── NAVEGACIÓN ────────────────────────────────────────────
navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        appTitle.innerText = TITLES[currentView] || currentView;
        renderView(currentView);
    });
});

fab.addEventListener('click',           () => openModal(currentView));
btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));

function renderView(view) {
    appContent.innerHTML = '';
    if (view === 'home')      renderHome();
    if (view === 'clientes')  renderClientes();
    if (view === 'productos') renderProductos();
    if (view === 'ventas')    renderVentas();
    if (view === 'pedidos')   renderPedidos();
}

// ══════════════════════════════════════════════════════════
//  HOME (Dashboard + Estadísticas)
// ══════════════════════════════════════════════════════════
function renderHome() {
    const tabsHTML = `
    <div class="home-tabs">
        <button class="home-tab ${_homeTab === 'dashboard' ? 'active' : ''}"
                onclick="window.app.setHomeTab('dashboard')">Inicio</button>
        <button class="home-tab ${_homeTab === 'stats' ? 'active' : ''}"
                onclick="window.app.setHomeTab('stats')">Estadísticas</button>
    </div>`;

    appContent.innerHTML = tabsHTML + (_homeTab === 'dashboard' ? getDashboardHTML() : getStatsHTML());
}

function getDashboardHTML() {
    const ventas    = DB.get('ventas');
    const clientes  = DB.get('clientes');
    const pedidos   = DB.get('pedidos');
    const productos = DB.get('productos');

    const hoy       = new Date().toISOString().split('T')[0];
    const mesAct    = new Date().toISOString().slice(0, 7);
    const vHoy      = ventas.filter(v => v.createdAt.startsWith(hoy));
    const cajaHoy   = vHoy.reduce((s, v) => s + Number(v.total), 0);
    const cajaMes   = ventas.filter(v => v.createdAt.startsWith(mesAct)).reduce((s, v) => s + Number(v.total), 0);
    const deuda     = clientes.reduce((s, c) => s + (Number(c.deuda) || 0), 0);
    const pedPend   = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'listo').length;
    const pedHoy    = pedidos.filter(p => p.estado === 'pendiente' &&
        new Date(p.fechaEntrega).toDateString() === new Date().toDateString()).length;

    const proximos = pedidos
        .filter(p => p.estado === 'pendiente')
        .sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega))
        .slice(0, 3);

    const stockBajo = productos.filter(p => p.stock <= p.stockMinimo);
    const hoyStr    = new Date().toDateString();

    let proximosHTML = '';
    if (proximos.length > 0) {
        proximosHTML = `<div class="card"><div class="card-title" style="margin-bottom:10px">Próximas entregas</div>` +
        proximos.map(p => {
            const c     = clientes.find(cl => cl.id === p.clienteId);
            const fecha = new Date(p.fechaEntrega + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
            const esHoy = new Date(p.fechaEntrega).toDateString() === hoyStr;
            const past  = new Date(p.fechaEntrega) < new Date() && !esHoy;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #2a2a2a">
                <div>
                    <div style="font-size:14px;font-weight:600">${c ? c.nombre : 'Sin cliente'}</div>
                    <div style="font-size:12px;color:${past ? 'var(--danger)' : esHoy ? 'var(--primary-gold)' : 'var(--text-muted)'}">
                        ${past ? '⚠ ' : ''}${fecha}${esHoy ? ' — HOY' : ''}</div>
                </div>
                <span style="font-weight:bold;color:var(--primary-gold)">$${p.total}</span>
            </div>`;
        }).join('') + `</div>`;
    }

    let alertaHTML = '';
    if (stockBajo.length > 0) {
        alertaHTML = `<div class="card" style="border:1px solid rgba(207,102,121,0.3)">
            <div class="card-title" style="color:var(--danger);margin-bottom:8px">⚠ Stock bajo</div>
            ${stockBajo.map(p => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
                <span>${p.nombre}</span>
                <span style="color:var(--danger);font-weight:bold">${p.stock} unid.</span></div>`).join('')}
        </div>`;
    }

    return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div class="card" style="margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted)">Caja hoy</div>
            <div style="font-size:24px;font-weight:bold;margin-top:2px">$${cajaHoy.toFixed(0)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${vHoy.length} venta${vHoy.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="card" style="margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted)">Caja del mes</div>
            <div style="font-size:24px;font-weight:bold;margin-top:2px">$${cajaMes.toFixed(0)}</div>
        </div>
        <div class="card" style="margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted)">Deuda total</div>
            <div style="font-size:24px;font-weight:bold;color:var(--danger);margin-top:2px">$${deuda.toFixed(0)}</div>
        </div>
        <div class="card" style="margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted)">Pedidos activos</div>
            <div style="font-size:24px;font-weight:bold;color:var(--info);margin-top:2px">${pedPend}</div>
            ${pedHoy > 0 ? `<div style="font-size:11px;color:var(--danger);margin-top:2px">⚠ ${pedHoy} para hoy</div>` : ''}
        </div>
    </div>
    ${alertaHTML}${proximosHTML}
    <button class="btn-primary"   onclick="window.app.openModal('ventas')"  style="margin-top:4px">+ Nueva venta</button>
    <button class="btn-secondary" onclick="window.app.openModal('pedidos')" style="margin-top:8px">+ Nuevo pedido</button>`;
}

function getStatsHTML() {
    const s       = DB.getStats();
    const BAR_H   = 72;
    const maxDia  = Math.max(...s.dias.map(d => d.total), 1);
    const maxProd = s.topProductos[0]?.unidades || 1;
    const maxMet  = s.metodosArr[0]?.count || 1;

    const barsHTML = s.dias.map((d, i) => {
        const h       = d.total > 0 ? Math.max(Math.round(d.total / maxDia * BAR_H), 4) : 2;
        const isToday = i === 6;
        const lbl     = d.total > 0 ? (d.total >= 1000 ? `$${(d.total / 1000).toFixed(1)}k` : `$${d.total}`) : '';
        return `<div class="stat-bar-col">
            <span class="stat-bar-label-top">${lbl}</span>
            <div class="stat-bar-inner">
                <div class="stat-bar" style="height:${h}px;background:${isToday ? 'var(--primary-gold)' : '#333'}"></div>
            </div>
            <span class="stat-bar-label-bot" style="color:${isToday ? 'var(--primary-gold)' : 'var(--text-muted)'};font-weight:${isToday ? 'bold' : 'normal'}">${d.label}</span>
        </div>`;
    }).join('');

    const topProdHTML = s.topProductos.length > 0
        ? s.topProductos.map((p, i) => {
            const pct = Math.round(p.unidades / maxProd * 100);
            return `<div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                    <span>${i + 1}. ${p.nombre}</span>
                    <span style="color:var(--text-muted)">${p.unidades} unid.</span>
                </div>
                <div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px">Sin ventas registradas aún.</p>';

    const metodosHTML = s.metodosArr.length > 0
        ? s.metodosArr.map(m => {
            const pct = Math.round(m.count / maxMet * 100);
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:12px;min-width:112px;color:var(--text-muted)">${m.metodo}</span>
                <div class="mini-progress" style="flex:1;height:6px">
                    <div style="height:100%;width:${pct}%;background:var(--info);border-radius:3px"></div>
                </div>
                <span style="font-size:12px;color:var(--text-muted);min-width:28px;text-align:right">${m.pct}%</span>
            </div>`;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px">Sin ventas aún.</p>';

    const deudoresHTML = s.topDeudores.length > 0
        ? s.topDeudores.map(c =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #2a2a2a">
                <div>
                    <div style="font-size:13px">${c.nombre} ${c.apellido || ''}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${c.tipoPrecio === 'mayorista' ? 'Mayorista' : 'Minorista'}</div>
                </div>
                <span style="color:var(--danger);font-weight:bold">$${c.deuda}</span>
            </div>`).join('')
        : '<p style="color:var(--text-muted);font-size:13px">No hay deudas pendientes.</p>';

    const ps = s.pedidosStats;
    const cobradoPct = s.totalMes > 0 ? Math.round(s.cobradoMes / s.totalMes * 100) : 0;

    return `
    <div class="card">
        <div class="card-title" style="margin-bottom:14px">Ventas — últimos 7 días</div>
        <div class="stat-bar-container">${barsHTML}</div>
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:10px">Este mes</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
            <span style="color:var(--text-muted)">Cobrado</span>
            <span style="color:var(--success);font-weight:bold">$${s.cobradoMes.toFixed(0)}</span>
        </div>
        <div class="mini-progress"><div class="mini-progress-fill" style="width:${cobradoPct}%;background:var(--success)"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:10px;margin-bottom:6px">
            <span style="color:var(--text-muted)">Fiado / pendiente</span>
            <span style="color:var(--danger);font-weight:bold">$${s.pendienteMes.toFixed(0)}</span>
        </div>
        <div class="mini-progress"><div class="mini-progress-fill" style="width:${100 - cobradoPct}%;background:var(--danger)"></div></div>
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:12px">Métodos de pago</div>
        ${metodosHTML}
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:12px">Top productos</div>
        ${topProdHTML}
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:10px">Top deudores</div>
        ${deudoresHTML}
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:12px">Pedidos del mes</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
            <div>
                <div style="font-size:28px;font-weight:bold;color:var(--info)">${ps.pendientes}</div>
                <div style="font-size:11px;color:var(--text-muted)">Pendientes</div>
            </div>
            <div>
                <div style="font-size:28px;font-weight:bold;color:var(--success)">${ps.entregados}</div>
                <div style="font-size:11px;color:var(--text-muted)">Entregados</div>
            </div>
            <div>
                <div style="font-size:28px;font-weight:bold;color:var(--danger)">${ps.cancelados}</div>
                <div style="font-size:11px;color:var(--text-muted)">Cancelados</div>
            </div>
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  CLIENTES (con búsqueda)
// ══════════════════════════════════════════════════════════
function renderClientes(busqueda = '') {
    const clientes   = DB.get('clientes');
    const filtrados  = busqueda
        ? clientes.filter(c => `${c.nombre} ${c.apellido || ''} ${c.telefono || ''} ${c.estado || ''}`
            .toLowerCase().includes(busqueda.toLowerCase()))
        : clientes;

    let html = `
    <div class="search-wrap">
        <span class="material-icons-round">search</span>
        <input type="text" class="form-control" placeholder="Buscar cliente..."
               value="${busqueda}" oninput="window.app.buscarCliente(this.value)">
    </div>`;

    if (filtrados.length === 0) {
        html += `<p class="card-subtitle" style="text-align:center;padding:20px">No se encontraron clientes.</p>`;
    }

    filtrados.forEach(c => {
        const isMay    = c.tipoPrecio === 'mayorista';
        const tipoBadge = isMay ? `<span class="badge gold" style="font-size:10px">Mayorista</span>` : '';
        const tagBadge  = c.estado ? `<span class="badge info" style="font-size:10px">${c.estado}</span>` : '';
        const movs      = c.movimientos || [];
        const ultimos   = movs.slice(-6).reverse();

        const movHTML = movs.length > 0 ? `
        <div class="mov-timeline" id="mov-${c.id}" style="display:none">
            ${ultimos.map(m => {
                const fecha   = new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                const esCargo = m.cargo > 0;
                const importe = esCargo ? m.cargo : m.abono;
                const metodo  = m.metodoPago ? ` · ${m.metodoPago}` : '';
                return `<div class="mov-item">
                    <span class="mov-fecha">${fecha}</span>
                    <span class="mov-desc">${m.descripcion}${metodo}</span>
                    <span class="${esCargo ? 'mov-cargo' : 'mov-abono'}">${esCargo ? '-' : '+'}$${importe}</span>
                </div>`;
            }).join('')}
            <div class="mov-saldo-total">Saldo: $${c.deuda || 0}</div>
        </div>` : '';

        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div class="card-title">${c.nombre} ${c.apellido || ''}</div>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;margin:4px 0">${tipoBadge}${tagBadge}</div>
                    <div style="font-size:13px;color:var(--text-muted)">${c.telefono || ''}</div>
                    <div style="color:${c.deuda > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:bold;margin-top:4px">
                        Deuda: $${c.deuda || 0}
                    </div>
                </div>
                <button class="icon-btn success" onclick="window.wpp.openChat('${c.telefono}')">
                    <span class="material-icons-round">chat</span>
                </button>
            </div>
            ${movs.length > 0 ? `
            <button class="btn-secondary"
                    style="padding:7px 12px;font-size:12px;margin-top:10px;width:auto;display:inline-flex;align-items:center;gap:5px"
                    onclick="window.app.toggleMovimientos('${c.id}')">
                <span class="material-icons-round" style="font-size:15px">history</span>
                Historial (${movs.length})
            </button>
            ${movHTML}` : ''}
            <div class="action-row">
                ${c.deuda > 0 ? `
                <button class="icon-btn success" title="Registrar pago" onclick="window.app.openPagoModal('${c.id}')">
                    <span class="material-icons-round">payments</span>
                </button>
                <button class="icon-btn gold" title="Enviar resumen por WhatsApp" onclick="window.app.enviarResumenDeuda('${c.id}')">
                    <span class="material-icons-round">request_quote</span>
                </button>` : ''}
                <button class="icon-btn" onclick="window.app.editCliente('${c.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="icon-btn danger" onclick="window.app.deleteCliente('${c.id}')">
                    <span class="material-icons-round">delete</span>
                </button>
            </div>
        </div>`;
    });

    appContent.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
//  PRODUCTOS (precio dual)
// ══════════════════════════════════════════════════════════
function renderProductos() {
    const productos = DB.get('productos');
    let html = '';
    if (productos.length === 0) html = `<p class="card-subtitle">No hay productos aún.</p>`;

    productos.forEach(p => {
        const stockClass    = p.stock <= p.stockMinimo ? 'danger' : 'success';
        const hasMayorista  = Number(p.precioMayorista) !== Number(p.precio);
        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div class="card-title">${p.nombre}</div>
                <span class="badge ${stockClass}">Stock: ${p.stock}</span>
            </div>
            <div class="card-subtitle">${p.categoria} | Mín: ${p.stockMinimo}</div>
            <div style="display:flex;gap:12px;margin-top:4px">
                <div style="font-size:14px">Min: <b>$${p.precio}</b></div>
                <div style="font-size:14px;color:${hasMayorista ? 'var(--info)' : 'var(--text-muted)'}">
                    May: <b>$${p.precioMayorista}</b>
                </div>
            </div>
            <div class="action-row">
                <button class="icon-btn" onclick="window.app.editProducto('${p.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="icon-btn danger" onclick="window.app.deleteProducto('${p.id}')">
                    <span class="material-icons-round">delete</span>
                </button>
            </div>
        </div>`;
    });
    appContent.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
//  VENTAS
// ══════════════════════════════════════════════════════════
function renderVentas() {
    const ventas   = DB.get('ventas');
    const clientes = DB.get('clientes');
    let html = '';
    if (ventas.length === 0) html = `<p class="card-subtitle">No hay ventas aún.</p>`;

    [...ventas].reverse().forEach(v => {
        const date    = new Date(v.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
        const cliente = clientes.find(c => c.id === v.clienteId);
        const nombre  = cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Consumidor final';
        const items   = (v.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
        const metodo  = v.metodoPago || 'Efectivo';

        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div class="card-title">${nombre}</div>
                <span class="badge ${v.saldoPendiente > 0 ? 'danger' : 'success'}">${v.estado}</span>
            </div>
            <div class="card-subtitle" style="margin-bottom:2px">${date}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${items}</div>
            <div style="display:flex;gap:12px;font-size:13px;flex-wrap:wrap">
                <span>Total: <b>$${v.total}</b></span>
                <span style="color:var(--success)">Pagado: $${v.montoPagado}</span>
                ${v.saldoPendiente > 0 ? `<span style="color:var(--danger)">Saldo: $${v.saldoPendiente}</span>` : ''}
                <span class="badge info" style="font-size:10px">${metodo}</span>
                ${v.descuento > 0 ? `<span class="badge gold" style="font-size:10px">${v.descuento}% dto.</span>` : ''}
            </div>
            ${v.notas ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">"${v.notas}"</div>` : ''}
            <div class="action-row">
                <button class="icon-btn success" onclick="window.wpp.sendOrderReady('${nombre}','${cliente?.telefono||''}')">
                    <span class="material-icons-round">local_shipping</span>
                </button>
                <button class="icon-btn danger" onclick="window.app.deleteVenta('${v.id}')">
                    <span class="material-icons-round">delete_forever</span>
                </button>
            </div>
        </div>`;
    });
    appContent.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
//  PEDIDOS
// ══════════════════════════════════════════════════════════
function renderPedidos() {
    const pedidos  = DB.get('pedidos');
    const clientes = DB.get('clientes');
    const hoyStr   = new Date().toDateString();

    const filtros = [
        { key: 'pendiente', label: 'Pendientes' },
        { key: 'listo',     label: 'Listos'     },
        { key: 'entregado', label: 'Entregados' },
        { key: 'cancelado', label: 'Cancelados' },
        { key: 'todos',     label: 'Todos'      },
    ];

    const filtrados = _pedidoFiltro === 'todos'
        ? pedidos
        : pedidos.filter(p => p.estado === _pedidoFiltro);

    const tabsHTML = filtros.map(f => {
        const n = f.key === 'todos' ? pedidos.length : pedidos.filter(p => p.estado === f.key).length;
        return `<button class="filter-tab ${_pedidoFiltro === f.key ? 'active' : ''}"
            onclick="window.app.filtrarPedidos('${f.key}')">
            ${f.label} <span class="tab-count">${n}</span>
        </button>`;
    }).join('');

    const pendCount = pedidos.filter(p => p.estado === 'pendiente').length;
    const hoyCount  = pedidos.filter(p => p.estado === 'pendiente' && new Date(p.fechaEntrega).toDateString() === hoyStr).length;

    let html = '';
    if (pendCount > 0) {
        html += `<div class="card" style="background:rgba(212,175,55,0.07);border:1px solid rgba(212,175,55,0.2);margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:600;font-size:15px">${pendCount} pendiente${pendCount !== 1 ? 's' : ''}</div>
                    ${hoyCount > 0 ? `<div style="color:var(--danger);font-size:13px;margin-top:2px">⚠ ${hoyCount} para hoy</div>` : ''}
                </div>
                <span class="material-icons-round" style="font-size:32px;color:var(--primary-gold);opacity:0.4">assignment</span>
            </div>
        </div>`;
    }

    html += `<div class="filter-tabs">${tabsHTML}</div>`;

    if (filtrados.length === 0) {
        html += `<p class="card-subtitle" style="text-align:center;padding:20px">No hay pedidos aquí.</p>`;
    }

    const estadoMap = {
        pendiente: { badge: 'info',    label: 'Pendiente' },
        listo:     { badge: 'success', label: '✓ Listo'   },
        entregado: { badge: '',        label: 'Entregado' },
        cancelado: { badge: 'danger',  label: 'Cancelado' },
    };

    [...filtrados].reverse().forEach(p => {
        const cliente   = clientes.find(c => c.id === p.clienteId);
        const nombre    = cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Sin cliente';
        const fecha     = new Date(p.fechaEntrega + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
        const esHoy     = new Date(p.fechaEntrega).toDateString() === hoyStr;
        const esPasado  = new Date(p.fechaEntrega) < new Date() && p.estado === 'pendiente' && !esHoy;
        const itemsText = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
        const { badge, label } = estadoMap[p.estado] || { badge: '', label: p.estado };
        const ventaLink = p.ventaId ? `<span class="badge success" style="font-size:10px">Venta registrada</span>` : '';

        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1;margin-right:8px">
                    <div class="card-title">${nombre}</div>
                    <div class="card-subtitle" style="margin-bottom:4px">${itemsText}</div>
                    <div style="font-size:13px;color:${esPasado ? 'var(--danger)' : esHoy ? 'var(--primary-gold)' : 'var(--text-muted)'}">
                        <span class="material-icons-round" style="font-size:13px;vertical-align:-2px">event</span>
                        ${esPasado ? '⚠ ' : ''}${fecha}${esHoy ? ' — HOY' : ''}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                    <span class="badge ${badge}">${label}</span>
                    ${ventaLink}
                </div>
            </div>
            ${p.notas ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">"${p.notas}"</div>` : ''}
            ${p.descuento > 0 ? `<div style="font-size:12px;color:var(--primary-gold);margin-top:4px">${p.descuento}% de descuento aplicado</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;border-top:1px solid #2a2a2a;padding-top:10px">
                <div style="font-size:20px;font-weight:bold">$${p.total}</div>
                <div style="display:flex;gap:4px;align-items:center">
                    ${p.estado === 'pendiente' ? `
                    <button class="icon-btn gold" title="Marcar como listo" onclick="window.app.marcarListo('${p.id}')">
                        <span class="material-icons-round">check_circle</span>
                    </button>
                    <button class="icon-btn danger" title="Cancelar pedido" onclick="window.app.cancelarPedido('${p.id}')">
                        <span class="material-icons-round">cancel</span>
                    </button>` : ''}
                    ${p.estado === 'listo' ? `
                    <button class="icon-btn success" title="Entregar y cobrar" onclick="window.app.abrirEntrega('${p.id}')">
                        <span class="material-icons-round">local_shipping</span>
                    </button>` : ''}
                    ${cliente?.telefono ? `
                    <button class="icon-btn" title="WhatsApp" onclick="window.app.wppPedido('${p.id}')">
                        <span class="material-icons-round">chat</span>
                    </button>` : ''}
                    <button class="icon-btn danger" onclick="window.app.deletePedido('${p.id}')">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
            </div>
        </div>`;
    });

    appContent.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
//  HELPERS DE FORMULARIO
// ══════════════════════════════════════════════════════════
function getTomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function metodoPills(inputId, defaultVal = 'Efectivo') {
    return `<div class="metodo-pills">
        ${METODOS_PAGO.map(m =>
            `<button type="button" class="metodo-pill ${m === defaultVal ? 'active' : ''}"
                     data-value="${m}" onclick="window.app.selectMetodo(this,'${inputId}')">${m}</button>`
        ).join('')}
    </div>
    <input type="hidden" id="${inputId}" value="${defaultVal}">`;
}

function getPrecioItem(p) {
    return _formClienteTipo === 'mayorista' ? (Number(p.precioMayorista) || Number(p.precio)) : Number(p.precio);
}

function renderVentaItemsForm(productos) {
    const container = document.getElementById('venta-items-container');
    if (!container) return;
    container.innerHTML = _ventaItems.map((item, idx) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <select class="form-control" style="flex:1" onchange="window.app.updateVentaItem(${idx},this.value)">
            <option value="">Elegir producto...</option>
            ${productos.filter(p => p.stock > 0 || p.id === item.productoId).map(p => {
                const precio = getPrecioItem(p);
                return `<option value="${p.id}|||${p.nombre}|||${p.precio}|||${p.precioMayorista || p.precio}"
                    ${item.productoId === p.id ? 'selected' : ''}>
                    ${p.nombre} · $${precio} (stock: ${p.stock})
                </option>`;
            }).join('')}
        </select>
        <input type="number" class="form-control" style="width:64px;flex:none" value="${item.cantidad}" min="1"
               oninput="window.app.updateVentaQty(${idx},Number(this.value))">
        ${_ventaItems.length > 1 ? `
        <button type="button" class="icon-btn danger" style="flex:none" onclick="window.app.removeVentaItem(${idx})">
            <span class="material-icons-round">close</span>
        </button>` : ''}
    </div>`).join('');
    updateVentaTotalDisplay();
}

function updateVentaTotalDisplay() {
    const descuento = Number(document.getElementById('v-descuento')?.value) || 0;
    const pagado    = Number(document.getElementById('v-pago')?.value)      || 0;
    const bruto     = _ventaItems.reduce((s, i) => s + (i.precioUnitario || 0) * (i.cantidad || 0), 0);
    const total     = bruto * (1 - descuento / 100);
    const saldo     = Math.max(0, total - pagado);
    const elT = document.getElementById('venta-total');
    const elS = document.getElementById('venta-saldo');
    if (elT) elT.textContent = `$${total.toFixed(0)}${descuento > 0 ? ` (-${descuento}%)` : ''}`;
    if (elS) elS.textContent = `Saldo pendiente: $${saldo.toFixed(0)}`;
}

function renderPedidoItemsForm(productos) {
    const container = document.getElementById('pedido-items-container');
    if (!container) return;
    container.innerHTML = _pedidoItems.map((item, idx) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <select class="form-control" style="flex:1" onchange="window.app.updatePedidoItem(${idx},this.value)">
            <option value="">Elegir producto...</option>
            ${productos.map(p => {
                const precio = getPrecioItem(p);
                return `<option value="${p.id}|||${p.nombre}|||${p.precio}|||${p.precioMayorista || p.precio}"
                    ${item.productoId === p.id ? 'selected' : ''}>
                    ${p.nombre} · $${precio}
                </option>`;
            }).join('')}
        </select>
        <input type="number" class="form-control" style="width:64px;flex:none" value="${item.cantidad}" min="1"
               oninput="window.app.updatePedidoQty(${idx},Number(this.value))">
        ${_pedidoItems.length > 1 ? `
        <button type="button" class="icon-btn danger" style="flex:none" onclick="window.app.removePedidoItem(${idx})">
            <span class="material-icons-round">close</span>
        </button>` : ''}
    </div>`).join('');
    updatePedidoTotalDisplay();
}

function updatePedidoTotalDisplay() {
    const descuento = Number(document.getElementById('p-descuento')?.value) || 0;
    const bruto     = _pedidoItems.reduce((s, i) => s + (i.precioUnitario || 0) * (i.cantidad || 0), 0);
    const total     = bruto * (1 - descuento / 100);
    const el = document.getElementById('pedido-total');
    if (el) el.textContent = `$${total.toFixed(0)}${descuento > 0 ? ` (-${descuento}%)` : ''}`;
}

// ══════════════════════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════════════════════
function openModal(view, idToEdit = null) {
    modal.classList.remove('hidden');
    _formClienteTipo = 'minorista';

    // ── CLIENTES ──────────────────────────────────────────
    if (view === 'clientes') {
        const c = idToEdit ? DB.getById('clientes', idToEdit) : {};
        const tipo = c.tipoPrecio || 'minorista';
        modalTitle.innerText = idToEdit ? 'Editar cliente' : 'Nuevo cliente';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Nombre</label>
                <input type="text" id="f-nombre" class="form-control" required value="${c.nombre || ''}"></div>
            <div class="form-group"><label>Apellido</label>
                <input type="text" id="f-apellido" class="form-control" value="${c.apellido || ''}"></div>
            <div class="form-group"><label>Teléfono (WhatsApp)</label>
                <input type="tel" id="f-tel" class="form-control" required value="${c.telefono || ''}"></div>
            <div class="form-group"><label>Etiqueta</label>
                <input type="text" id="f-estado" class="form-control" value="${c.estado || ''}" placeholder="Frecuente, Restaurante..."></div>
            <div class="form-group">
                <label>Tipo de precio</label>
                <div class="metodo-pills">
                    <button type="button" class="metodo-pill ${tipo === 'minorista' ? 'active' : ''}"
                            data-value="minorista" onclick="window.app.selectMetodo(this,'f-tipo')">Minorista</button>
                    <button type="button" class="metodo-pill ${tipo === 'mayorista' ? 'active' : ''}"
                            data-value="mayorista" onclick="window.app.selectMetodo(this,'f-tipo')">Mayorista</button>
                </div>
                <input type="hidden" id="f-tipo" value="${tipo}">
            </div>
            ${idToEdit ? `<div class="form-group"><label>Ajustar deuda manualmente ($)</label>
                <input type="number" id="f-deuda" class="form-control" value="${c.deuda || 0}"></div>` : ''}
            <button type="submit" class="btn-primary">${idToEdit ? 'Actualizar' : 'Guardar'}</button>
        </form>`;

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const data = {
                nombre:     document.getElementById('f-nombre').value.trim(),
                apellido:   document.getElementById('f-apellido').value.trim(),
                telefono:   document.getElementById('f-tel').value.trim(),
                estado:     document.getElementById('f-estado').value.trim(),
                tipoPrecio: document.getElementById('f-tipo').value,
            };
            if (idToEdit) data.deuda = Number(document.getElementById('f-deuda').value);
            else data.deuda = 0;
            if (idToEdit) DB.update('clientes', idToEdit, data);
            else DB.add('clientes', data);
            modal.classList.add('hidden');
            renderClientes();
        };
    }

    // ── PRODUCTOS ─────────────────────────────────────────
    else if (view === 'productos') {
        const p = idToEdit ? DB.getById('productos', idToEdit) : {};
        modalTitle.innerText = idToEdit ? 'Editar producto' : 'Nuevo producto';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Nombre</label>
                <input type="text" id="f-nombre" class="form-control" required value="${p.nombre || ''}"></div>
            <div class="form-group"><label>Categoría</label>
                <input type="text" id="f-cat" class="form-control" required value="${p.categoria || ''}"></div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Precio minorista ($)</label>
                    <input type="number" id="f-precio" class="form-control" required value="${p.precio || ''}"></div>
                <div class="form-group"><label>Precio mayorista ($)</label>
                    <input type="number" id="f-pmay" class="form-control" value="${p.precioMayorista ?? p.precio ?? ''}"></div>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Stock actual</label>
                    <input type="number" id="f-stock" class="form-control" required value="${p.stock ?? ''}"></div>
                <div class="form-group"><label>Stock mínimo</label>
                    <input type="number" id="f-min" class="form-control" value="${p.stockMinimo ?? 5}"></div>
            </div>
            <button type="submit" class="btn-primary">${idToEdit ? 'Actualizar' : 'Guardar'}</button>
        </form>`;

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const precio = Number(document.getElementById('f-precio').value);
            const pmay   = Number(document.getElementById('f-pmay').value) || precio;
            const data   = {
                nombre:          document.getElementById('f-nombre').value.trim(),
                categoria:       document.getElementById('f-cat').value.trim(),
                precio,
                precioMayorista: pmay,
                stock:           Number(document.getElementById('f-stock').value),
                stockMinimo:     Number(document.getElementById('f-min').value),
            };
            if (idToEdit) DB.update('productos', idToEdit, data);
            else DB.add('productos', data);
            modal.classList.add('hidden');
            renderProductos();
        };
    }

    // ── VENTAS ────────────────────────────────────────────
    else if (view === 'ventas' || view === 'home') {
        const clientes  = DB.get('clientes');
        const productos = DB.get('productos');
        _ventaItems     = [{ productoId: '', cantidad: 1, nombreProducto: '', precioUnitario: 0 }];

        modalTitle.innerText = 'Registrar venta';
        modalBody.innerHTML  = `
        <form id="form-data">
            <div class="form-group">
                <label>Cliente</label>
                <select id="v-cliente" class="form-control" onchange="window.app.onClienteChange(this.value,'venta')">
                    <option value="">Consumidor final</option>
                    ${clientes.map(c =>
                        `<option value="${c.id}">${c.nombre} ${c.apellido || ''}${c.tipoPrecio === 'mayorista' ? ' [May]' : ''}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Productos</label>
                <div id="venta-items-container"></div>
                <button type="button" class="btn-secondary"
                        style="padding:7px 14px;font-size:13px;margin-top:4px"
                        onclick="window.app.addVentaItem()">+ Agregar ítem</button>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group">
                    <label>Descuento (%)</label>
                    <input type="number" id="v-descuento" class="form-control" value="0" min="0" max="100"
                           oninput="updateVentaTotalDisplay()">
                </div>
                <div class="form-group">
                    <label>Pagado ahora ($)</label>
                    <input type="number" id="v-pago" class="form-control" value="0" min="0"
                           oninput="updateVentaTotalDisplay()">
                </div>
            </div>
            <div class="form-group">
                <label>Método de pago</label>
                ${metodoPills('v-metodo')}
            </div>
            <div class="form-group">
                <label>Notas (opcional)</label>
                <input type="text" id="v-notas" class="form-control" placeholder="Pedido por teléfono, entrega domicilio...">
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #2a2a2a">
                <div>
                    <div id="venta-total" style="font-size:24px;font-weight:bold;color:var(--primary-gold)">$0</div>
                    <div id="venta-saldo" style="font-size:12px;color:var(--text-muted)">Saldo pendiente: $0</div>
                </div>
            </div>
            <button type="submit" class="btn-primary">Confirmar venta</button>
        </form>`;

        renderVentaItemsForm(productos);

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const validItems = _ventaItems.filter(i => i.productoId);
            if (validItems.length === 0) { alert('Agregá al menos un producto.'); return; }

            const clienteId  = document.getElementById('v-cliente').value;
            const descuento  = Number(document.getElementById('v-descuento').value) || 0;
            const pagado     = Number(document.getElementById('v-pago').value) || 0;
            const metodoPago = document.getElementById('v-metodo').value;
            const notas      = document.getElementById('v-notas').value.trim();
            const bruto      = validItems.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
            const total      = bruto * (1 - descuento / 100);

            try {
                DB.crearVenta({ clienteId: clienteId || null, items: validItems, total, montoPagado: pagado, metodoPago, notas, descuento });
                modal.classList.add('hidden');
                const cliente = clientes.find(c => c.id === clienteId);
                if (cliente?.telefono && confirm('Venta registrada. ¿Enviar comprobante por WhatsApp?')) {
                    const txt = validItems.map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
                    WhatsApp.sendOrderDetails(cliente.nombre, cliente.telefono, txt, total.toFixed(0), metodoPago);
                }
                currentView === 'ventas' ? renderVentas() : renderView('home');
            } catch (err) {
                alert('Error: ' + err.message);
            }
        };
    }

    // ── PEDIDOS ───────────────────────────────────────────
    else if (view === 'pedidos') {
        const clientes  = DB.get('clientes');
        const productos = DB.get('productos');
        _pedidoItems    = [{ productoId: '', cantidad: 1, nombreProducto: '', precioUnitario: 0 }];

        modalTitle.innerText = 'Nuevo pedido / encargo';
        modalBody.innerHTML  = `
        <form id="form-data">
            <div class="form-group">
                <label>Cliente</label>
                <select id="p-cliente" class="form-control" onchange="window.app.onClienteChange(this.value,'pedido')">
                    <option value="">Sin asignar</option>
                    ${clientes.map(c =>
                        `<option value="${c.id}">${c.nombre} ${c.apellido || ''}${c.tipoPrecio === 'mayorista' ? ' [May]' : ''}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Productos</label>
                <div id="pedido-items-container"></div>
                <button type="button" class="btn-secondary"
                        style="padding:7px 14px;font-size:13px;margin-top:4px"
                        onclick="window.app.addPedidoItem()">+ Agregar ítem</button>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group">
                    <label>Fecha de entrega</label>
                    <input type="date" id="p-fecha" class="form-control" value="${getTomorrow()}" required>
                </div>
                <div class="form-group">
                    <label>Descuento (%)</label>
                    <input type="number" id="p-descuento" class="form-control" value="0" min="0" max="100"
                           oninput="updatePedidoTotalDisplay()">
                </div>
            </div>
            <div class="form-group">
                <label>Notas (opcional)</label>
                <input type="text" id="p-notas" class="form-control" placeholder="Sin sal, fideos cortos...">
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #2a2a2a">
                <span style="color:var(--text-muted);font-size:14px">Total estimado</span>
                <div id="pedido-total" style="font-size:24px;font-weight:bold;color:var(--primary-gold)">$0</div>
            </div>
            <button type="submit" class="btn-primary">Guardar pedido</button>
        </form>`;

        renderPedidoItemsForm(productos);

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const validItems = _pedidoItems.filter(i => i.productoId);
            if (validItems.length === 0) { alert('Agregá al menos un producto.'); return; }

            const clienteId = document.getElementById('p-cliente').value;
            const descuento = Number(document.getElementById('p-descuento').value) || 0;
            const fecha     = document.getElementById('p-fecha').value;
            const notas     = document.getElementById('p-notas').value.trim();
            const bruto     = validItems.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
            const total     = bruto * (1 - descuento / 100);

            DB.crearPedido({ clienteId: clienteId || null, items: validItems, fechaEntrega: fecha, notas, total, descuento });
            modal.classList.add('hidden');

            const cliente = clientes.find(c => c.id === clienteId);
            if (cliente?.telefono && confirm('Pedido guardado. ¿Enviar confirmación por WhatsApp?')) {
                const txt = validItems.map(i => `${i.cantidad}x ${i.nombreProducto}`).join('\n');
                WhatsApp.sendPedidoConfirmacion(cliente.nombre, cliente.telefono, txt, total.toFixed(0), fecha);
            }
            currentView === 'pedidos' ? renderPedidos() : renderView('home');
        };
    }

    // ── PAGO (cuenta corriente) ────────────────────────────
    else if (view === 'pago') {
        const c = DB.getById('clientes', idToEdit);
        if (!c) return;
        modalTitle.innerText = 'Registrar pago';
        modalBody.innerHTML  = `
        <div style="text-align:center;margin-bottom:20px;padding:14px;background:rgba(207,102,121,0.1);border-radius:12px">
            <div style="color:var(--text-muted);font-size:13px">Deuda de ${c.nombre}</div>
            <div style="font-size:36px;font-weight:bold;color:var(--danger)">$${c.deuda || 0}</div>
        </div>
        <form id="form-data">
            <div class="form-group">
                <label>Monto cobrado ($)</label>
                <input type="number" id="pago-monto" class="form-control" value="${c.deuda || 0}" min="0.01" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Método de pago</label>
                ${metodoPills('pago-metodo')}
            </div>
            <button type="submit" class="btn-primary">✓ Confirmar pago</button>
        </form>`;

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const monto  = Number(document.getElementById('pago-monto').value);
            const metodo = document.getElementById('pago-metodo').value;
            DB.registrarPago(idToEdit, monto, metodo, metodo);
            modal.classList.add('hidden');
            renderClientes();
        };
    }

    // ── ENTREGAR PEDIDO (sync con venta) ──────────────────
    else if (view === 'entregar-pedido') {
        const p       = DB.getById('pedidos', idToEdit);
        if (!p) return;
        const cliente = DB.getById('clientes', p.clienteId);
        const items   = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');

        modalTitle.innerText = 'Registrar entrega';
        modalBody.innerHTML  = `
        <div style="background:rgba(212,175,55,0.08);border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="font-size:13px;color:var(--text-muted)">Pedido de ${cliente ? cliente.nombre : 'Sin cliente'}</div>
            <div style="font-size:22px;font-weight:bold;margin:4px 0">$${p.total}</div>
            <div style="font-size:12px;color:var(--text-muted)">${items}</div>
        </div>
        <form id="form-data">
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:12px">
                    <input type="checkbox" id="reg-venta" checked style="width:18px;height:18px;accent-color:var(--primary-gold)">
                    <span>Registrar como venta (descuenta stock)</span>
                </label>
            </div>
            <div id="venta-fields">
                <div class="form-group">
                    <label>Cobrado ahora ($)</label>
                    <input type="number" id="conv-pago" class="form-control" value="${p.total}" min="0">
                </div>
                <div class="form-group">
                    <label>Método de pago</label>
                    ${metodoPills('conv-metodo')}
                </div>
            </div>
            <button type="submit" class="btn-primary">Confirmar entrega</button>
        </form>`;

        document.getElementById('reg-venta').addEventListener('change', function () {
            document.getElementById('venta-fields').style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const registrar = document.getElementById('reg-venta').checked;
            if (registrar) {
                const pago   = Number(document.getElementById('conv-pago').value);
                const metodo = document.getElementById('conv-metodo').value;
                try {
                    DB.convertirPedidoAVenta(idToEdit, pago, metodo);
                } catch (err) {
                    alert('Error: ' + err.message);
                    return;
                }
            } else {
                DB.actualizarEstadoPedido(idToEdit, 'entregado');
            }
            modal.classList.add('hidden');
            renderPedidos();
        };
    }
}

// ══════════════════════════════════════════════════════════
//  EXPOSICIÓN GLOBAL
// ══════════════════════════════════════════════════════════
window.wpp = WhatsApp;

// Para que updateVentaTotalDisplay sea accesible desde el modal (oninput)
window.updateVentaTotalDisplay = updateVentaTotalDisplay;

window.app = {
    openModal:    (view) => openModal(view),
    setHomeTab:   (tab)  => { _homeTab = tab; renderHome(); },

    // ── Clientes
    editCliente:  (id) => openModal('clientes', id),
    deleteCliente: (id) => {
        if (confirm('¿Eliminar este cliente y todo su historial?')) {
            DB.delete('clientes', id);
            renderClientes();
        }
    },
    buscarCliente:    (q)  => renderClientes(q),
    toggleMovimientos: (id) => {
        const el = document.getElementById(`mov-${id}`);
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    },
    openPagoModal: (id) => openModal('pago', id),
    enviarResumenDeuda: (id) => {
        const c = DB.getById('clientes', id);
        if (!c?.telefono) { alert('El cliente no tiene teléfono registrado.'); return; }
        WhatsApp.sendResumenDeuda(c.nombre, c.telefono, c.movimientos || [], c.deuda || 0);
    },

    // ── Productos
    editProducto:  (id) => openModal('productos', id),
    deleteProducto: (id) => {
        if (confirm('¿Eliminar este producto?')) { DB.delete('productos', id); renderProductos(); }
    },

    // ── Ventas
    deleteVenta: (id) => {
        if (confirm('Al eliminar la venta, el stock vuelve al inventario y se ajusta la deuda. ¿Proceder?')) {
            DB.eliminarVenta(id); renderVentas();
        }
    },

    // ── Pedidos
    filtrarPedidos: (f) => { _pedidoFiltro = f; renderPedidos(); },
    marcarListo: (id) => {
        DB.actualizarEstadoPedido(id, 'listo');
        const p = DB.getById('pedidos', id);
        const c = DB.getById('clientes', p?.clienteId);
        if (c?.telefono && confirm('Pedido marcado como listo. ¿Avisar al cliente?')) {
            const txt = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join('\n');
            WhatsApp.sendPedidoListo(c.nombre, c.telefono, txt);
        }
        renderPedidos();
    },
    abrirEntrega:  (id) => openModal('entregar-pedido', id),
    cancelarPedido: (id) => {
        if (confirm('¿Cancelar este pedido?')) { DB.cancelarPedido(id); renderPedidos(); }
    },
    wppPedido: (id) => {
        const p = DB.getById('pedidos', id);
        const c = DB.getById('clientes', p?.clienteId);
        if (!c?.telefono) return;
        const txt = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join('\n');
        if (p.estado === 'listo') WhatsApp.sendPedidoListo(c.nombre, c.telefono, txt);
        else WhatsApp.sendPedidoConfirmacion(c.nombre, c.telefono, txt, p.total, p.fechaEntrega);
    },
    deletePedido: (id) => {
        if (confirm('¿Eliminar este pedido?')) { DB.eliminarPedido(id); renderPedidos(); }
    },

    // ── Items de venta
    addVentaItem: () => {
        _ventaItems.push({ productoId: '', cantidad: 1, nombreProducto: '', precioUnitario: 0 });
        renderVentaItemsForm(DB.get('productos'));
    },
    updateVentaItem: (idx, value) => {
        if (!value) {
            _ventaItems[idx] = { productoId: '', cantidad: _ventaItems[idx].cantidad, nombreProducto: '', precioUnitario: 0 };
            updateVentaTotalDisplay();
            return;
        }
        const [productoId, nombre, precioMin, precioMay] = value.split('|||');
        const precio = _formClienteTipo === 'mayorista' ? Number(precioMay) : Number(precioMin);
        _ventaItems[idx] = { ..._ventaItems[idx], productoId, nombreProducto: nombre, precioUnitario: precio };
        updateVentaTotalDisplay();
    },
    updateVentaQty: (idx, cant) => {
        _ventaItems[idx].cantidad = cant;
        updateVentaTotalDisplay();
    },
    removeVentaItem: (idx) => {
        _ventaItems.splice(idx, 1);
        renderVentaItemsForm(DB.get('productos'));
    },
    updateVentaDescuento: updateVentaTotalDisplay,

    // ── Items de pedido
    addPedidoItem: () => {
        _pedidoItems.push({ productoId: '', cantidad: 1, nombreProducto: '', precioUnitario: 0 });
        renderPedidoItemsForm(DB.get('productos'));
    },
    updatePedidoItem: (idx, value) => {
        if (!value) {
            _pedidoItems[idx] = { productoId: '', cantidad: _pedidoItems[idx].cantidad, nombreProducto: '', precioUnitario: 0 };
            updatePedidoTotalDisplay();
            return;
        }
        const [productoId, nombre, precioMin, precioMay] = value.split('|||');
        const precio = _formClienteTipo === 'mayorista' ? Number(precioMay) : Number(precioMin);
        _pedidoItems[idx] = { ..._pedidoItems[idx], productoId, nombreProducto: nombre, precioUnitario: precio };
        updatePedidoTotalDisplay();
    },
    updatePedidoQty: (idx, cant) => {
        _pedidoItems[idx].cantidad = cant;
        updatePedidoTotalDisplay();
    },
    removePedidoItem: (idx) => {
        _pedidoItems.splice(idx, 1);
        renderPedidoItemsForm(DB.get('productos'));
    },

    // ── Precio dinámico según cliente
    onClienteChange: (clienteId, tipo) => {
        const c = clienteId ? DB.getById('clientes', clienteId) : null;
        _formClienteTipo = c?.tipoPrecio || 'minorista';
        const productos  = DB.get('productos');
        const items      = tipo === 'venta' ? _ventaItems : _pedidoItems;
        items.forEach(item => {
            if (item.productoId) {
                const p = productos.find(pr => pr.id === item.productoId);
                if (p) item.precioUnitario = getPrecioItem(p);
            }
        });
        if (tipo === 'venta') renderVentaItemsForm(productos);
        else                  renderPedidoItemsForm(productos);
    },

    // ── Selección de método/tipo (pills)
    selectMetodo: (el, inputId) => {
        el.closest('.metodo-pills').querySelectorAll('.metodo-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        document.getElementById(inputId).value = el.dataset.value || el.textContent.trim();
    },
};

// ── Arrancar
renderHome();
