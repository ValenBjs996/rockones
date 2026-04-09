import { DB, METODOS_PAGO, CANALES_ORIGEN, syncFromCloud } from './storage.js';
import { WhatsApp } from './whatsapp.js';

DB.init();

// ── DOM ───────────────────────────────────────────────────
const appContent    = document.getElementById('app-content');
const navItems      = document.querySelectorAll('.nav-item');
const appTitle      = document.getElementById('app-title');
const fab           = document.getElementById('fab-add');
const modal         = document.getElementById('modal-container');
const modalBody     = document.getElementById('modal-body');
const modalTitle    = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');

// ── ESTADO ───────────────────────────────────────────────
let currentView      = 'home';
let _homeTab         = 'dashboard';
let _pedidoFiltro    = 'pendiente';
let _pedidoItems     = [];
let _ventaItems      = [];
let _formClienteTipo = 'minorista';

const TITLES = { home: 'Inicio', ventas: 'Ventas', productos: 'Stock', clientes: 'Clientes', pedidos: 'Pedidos' };

// Colores por canal para la UI
const CANAL_COLORS = {
    'Mostrador':  '#64b5f6',
    'WhatsApp':   '#25d366',
    'Instagram':  '#e1306c',
    'PedidosYa':  '#ffc600',
    'Rappi':      '#ff6600',
    'Otro':       '#a0a0a0',
};

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

function renderView(v) {
    appContent.innerHTML = '';
    if (v === 'home')      renderHome();
    if (v === 'clientes')  renderClientes();
    if (v === 'productos') renderProductos();
    if (v === 'ventas')    renderVentas();
    if (v === 'pedidos')   renderPedidos();
}

// ══════════════════════════════════════════════════════════
//  HOME — Dashboard + Estadísticas
// ══════════════════════════════════════════════════════════
function renderHome() {
    const tabs = `
    <div class="home-tabs">
        <button class="home-tab ${_homeTab==='dashboard'?'active':''}" onclick="window.app.setHomeTab('dashboard')">Inicio</button>
        <button class="home-tab ${_homeTab==='stats'?'active':''}"     onclick="window.app.setHomeTab('stats')">Estadísticas</button>
    </div>`;
    appContent.innerHTML = tabs + (_homeTab === 'dashboard' ? getDashboardHTML() : getStatsHTML());
}

function getDashboardHTML() {
    const ventas    = DB.get('ventas');
    const clientes  = DB.get('clientes');
    const pedidos   = DB.get('pedidos');
    const productos = DB.get('productos');
    const hoy       = new Date().toISOString().split('T')[0];
    const mes       = new Date().toISOString().slice(0, 7);
    const vHoy      = ventas.filter(v => v.createdAt.startsWith(hoy));
    const cajaHoy   = vHoy.reduce((s, v) => s + Number(v.total), 0);
    const cajaMes   = ventas.filter(v => v.createdAt.startsWith(mes)).reduce((s, v) => s + Number(v.total), 0);
    const deuda     = clientes.reduce((s, c) => s + (Number(c.deuda) || 0), 0);
    const pedPend   = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'listo').length;
    const hoyStr    = new Date().toDateString();
    const pedHoy    = pedidos.filter(p => p.estado === 'pendiente' && new Date(p.fechaEntrega).toDateString() === hoyStr).length;
    const stockBajo = productos.filter(p => p.stock <= p.stockMinimo);
    const proximos  = pedidos.filter(p => p.estado === 'pendiente')
        .sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega)).slice(0, 3);

    let alertaHTML = '';
    if (stockBajo.length > 0) {
        alertaHTML = `<div class="card" style="border:1px solid rgba(207,102,121,0.3)">
            <div class="card-title" style="color:var(--danger);margin-bottom:8px">⚠ Stock bajo</div>
            ${stockBajo.map(p => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
                <span>${p.nombre}</span><span style="color:var(--danger);font-weight:bold">${p.stock} unid.</span></div>`).join('')}
        </div>`;
    }

    let proximosHTML = '';
    if (proximos.length > 0) {
        proximosHTML = `<div class="card"><div class="card-title" style="margin-bottom:10px">Próximas entregas</div>` +
            proximos.map(p => {
                const c    = clientes.find(cl => cl.id === p.clienteId);
                const f    = new Date(p.fechaEntrega + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
                const esH  = new Date(p.fechaEntrega).toDateString() === hoyStr;
                const past = new Date(p.fechaEntrega) < new Date() && !esH;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #2a2a2a">
                    <div>
                        <div style="font-size:14px;font-weight:600">${c ? c.nombre : 'Sin cliente'}</div>
                        <div style="font-size:12px;color:${past?'var(--danger)':esH?'var(--primary-gold)':'var(--text-muted)'}">
                            ${past?'⚠ ':''}${f}${esH?' — HOY':''}</div>
                    </div>
                    <span style="font-weight:bold;color:var(--primary-gold)">$${p.total}</span>
                </div>`;
            }).join('') + `</div>`;
    }

    return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div class="card" style="margin-bottom:0">
            <div style="font-size:11px;color:var(--text-muted)">Caja hoy</div>
            <div style="font-size:24px;font-weight:bold;margin-top:2px">$${cajaHoy.toFixed(0)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${vHoy.length} venta${vHoy.length!==1?'s':''}</div>
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
            ${pedHoy>0?`<div style="font-size:11px;color:var(--danger);margin-top:2px">⚠ ${pedHoy} para hoy</div>`:''}
        </div>
    </div>
    ${alertaHTML}${proximosHTML}
    <button class="btn-primary"   onclick="window.app.openModal('ventas')"  style="margin-top:4px">+ Nueva venta</button>
    <button class="btn-secondary" onclick="window.app.openModal('pedidos')" style="margin-top:8px">+ Nuevo pedido</button>
    <button class="btn-secondary" onclick="window.app.abrirCierreCaja()"   style="margin-top:8px">
        <span style="display:flex;align-items:center;justify-content:center;gap:6px">
            <span class="material-icons-round" style="font-size:18px">picture_as_pdf</span>
            Cierre de caja
        </span>
    </button>`;
}

function getStatsHTML() {
    const s      = DB.getStats();
    const BAR_H  = 72;
    const maxDia = Math.max(...s.dias.map(d => d.total), 1);
    const maxProd = s.topProductos[0]?.unidades || 1;

    const barsHTML = s.dias.map((d, i) => {
        const h     = d.total > 0 ? Math.max(Math.round(d.total / maxDia * BAR_H), 4) : 2;
        const isHoy = i === 6;
        const lbl   = d.total > 0 ? (d.total >= 1000 ? `$${(d.total/1000).toFixed(1)}k` : `$${d.total}`) : '';
        return `<div class="stat-bar-col">
            <span class="stat-bar-label-top">${lbl}</span>
            <div class="stat-bar-inner">
                <div class="stat-bar" style="height:${h}px;background:${isHoy?'var(--primary-gold)':'#333'}"></div>
            </div>
            <span class="stat-bar-label-bot" style="color:${isHoy?'var(--primary-gold)':'var(--text-muted)'};font-weight:${isHoy?'bold':'normal'}">${d.label}</span>
        </div>`;
    }).join('');

    const topProdHTML = s.topProductos.length > 0
        ? s.topProductos.map((p, i) => {
            const pct = Math.round(p.unidades / maxProd * 100);
            return `<div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                    <span>${i+1}. ${p.nombre}</span>
                    <span style="color:var(--text-muted)">${p.unidades} unid.</span>
                </div>
                <div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px">Sin ventas registradas.</p>';

    const metodosHTML = s.metodosArr.map(m => {
        const pct = Math.round(m.count / Math.max(s.metodosArr.reduce((a,x)=>a+x.count,0),1) * 100);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:12px;min-width:120px;color:var(--text-muted)">${m.metodo}</span>
            <div class="mini-progress" style="flex:1;height:6px">
                <div style="height:100%;width:${pct}%;background:var(--info);border-radius:3px"></div>
            </div>
            <span style="font-size:12px;color:var(--text-muted);min-width:48px;text-align:right">$${m.total.toFixed(0)}</span>
        </div>`;
    }).join('') || '<p style="color:var(--text-muted);font-size:13px">Sin ventas aún.</p>';

    // Canales de origen — gráfico + tabla
    const maxCanalTotal = Math.max(...s.canalesArr.map(c => c.total), 1);
    const canalesHTML = s.canalesArr.length > 0
        ? s.canalesArr.map(c => {
            const pct   = Math.round(c.total / maxCanalTotal * 100);
            const color = CANAL_COLORS[c.canal] || '#a0a0a0';
            return `<div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span class="canal-${c.canal.replace(/\s/g,'')}">${c.canal}</span>
                    <span style="font-size:12px;color:var(--text-muted)">${c.count} venta${c.count!==1?'s':''} · $${c.total.toFixed(0)}</span>
                </div>
                <div class="mini-progress" style="height:7px">
                    <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:3px">
                    <span>Cobrado: $${c.cobrado.toFixed(0)}</span>
                    <span>Pendiente: $${(c.total - c.cobrado).toFixed(0)}</span>
                </div>
            </div>`;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px">Sin ventas registradas.</p>';

    const deudoresHTML = s.topDeudores.length > 0
        ? s.topDeudores.map(c =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #2a2a2a">
                <div>
                    <div style="font-size:13px">${c.nombre} ${c.apellido||''}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${c.tipoPrecio==='mayorista'?'Mayorista':'Minorista'}</div>
                </div>
                <span style="color:var(--danger);font-weight:bold">$${c.deuda}</span>
            </div>`).join('')
        : '<p style="color:var(--text-muted);font-size:13px">No hay deudas.</p>';

    const cobradoPct = s.totalMes > 0 ? Math.round(s.cobradoMes / s.totalMes * 100) : 0;
    const ps         = s.pedidosStats;

    return `
    <div class="card">
        <div class="card-title" style="margin-bottom:14px">Ventas — últimos 7 días</div>
        <div class="stat-bar-container">${barsHTML}</div>
    </div>
    <div class="card">
        <div class="card-title" style="margin-bottom:10px">Este mes</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
            <span style="color:var(--text-muted)">Cobrado</span>
            <span style="color:var(--success);font-weight:bold">$${s.cobradoMes.toFixed(0)}</span>
        </div>
        <div class="mini-progress"><div class="mini-progress-fill" style="width:${cobradoPct}%;background:var(--success)"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:10px;margin-bottom:5px">
            <span style="color:var(--text-muted)">Fiado / pendiente</span>
            <span style="color:var(--danger);font-weight:bold">$${s.pendienteMes.toFixed(0)}</span>
        </div>
        <div class="mini-progress"><div class="mini-progress-fill" style="width:${100-cobradoPct}%;background:var(--danger)"></div></div>
    </div>
    <div class="card">
        <div class="card-title" style="margin-bottom:14px">Por canal de origen</div>
        ${canalesHTML}
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
            <div><div style="font-size:28px;font-weight:bold;color:var(--info)">${ps.pendientes}</div>
                 <div style="font-size:11px;color:var(--text-muted)">Pendientes</div></div>
            <div><div style="font-size:28px;font-weight:bold;color:var(--success)">${ps.entregados}</div>
                 <div style="font-size:11px;color:var(--text-muted)">Entregados</div></div>
            <div><div style="font-size:28px;font-weight:bold;color:var(--danger)">${ps.cancelados}</div>
                 <div style="font-size:11px;color:var(--text-muted)">Cancelados</div></div>
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  CIERRE DE CAJA — genera PDF con jsPDF
// ══════════════════════════════════════════════════════════
async function generarCierrePDF(fecha) {
    // Cargar jsPDF desde CDN si no está disponible
    if (!window.jspdf) {
        await new Promise((res, rej) => {
            const s   = document.createElement('script');
            s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload  = res;
            s.onerror = rej;
            document.head.appendChild(s);
        });
    }

    const { jsPDF }    = window.jspdf;
    const cierre       = DB.getCierreCaja(fecha);
    const fechaDisplay = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
    const W    = 210;
    const mg   = 15;
    const col2 = W - mg;
    let y      = 20;

    // ── Paleta (trabajamos en A4 blanco) ──
    const GOLD   = [212, 175, 55];
    const DARK   = [30,  30,  30];
    const MUTED  = [100, 100, 100];
    const DANGER = [207, 102, 121];
    const OK     = [3,   180, 160];
    const LINE   = [220, 220, 220];

    function setColor(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function rule(yy = y, color = LINE) {
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(0.3);
        doc.line(mg, yy, col2, yy);
    }
    function row(label, value, bold = false, valueColor = DARK) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10);
        setColor(MUTED);
        doc.text(label, mg, y);
        setColor(valueColor);
        doc.text(value, col2, y, { align: 'right' });
        y += 7;
    }
    function section(title) {
        y += 3;
        rule(y, LINE);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setColor(GOLD);
        doc.text(title, mg, y);
        y += 7;
    }

    // ── Encabezado ──
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, 0, W, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('Gestión de Pastas', mg, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Cierre de caja', mg, 20);
    doc.setFontSize(9);
    doc.text(fechaDisplay, col2, 20, { align: 'right' });

    y = 38;

    // ── Resumen general ──
    section('Resumen del día');
    row('Ventas realizadas', `${cierre.cantVentas}`, true);
    row('Total facturado',   `$${cierre.totalBruto.toFixed(2)}`,     true, DARK);
    row('Total cobrado',     `$${cierre.totalCobrado.toFixed(2)}`,   true, OK);
    row('Pendiente de cobro',`$${cierre.totalPendiente.toFixed(2)}`, true, cierre.totalPendiente > 0 ? DANGER : OK);
    row('Pedidos entregados',`${cierre.pedidosEntregados}`);

    // ── Por método de pago ──
    section('Cobrado por método de pago');
    if (Object.keys(cierre.porMetodo).length === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(MUTED);
        doc.text('Sin ventas en este día.', mg, y); y += 7;
    } else {
        Object.entries(cierre.porMetodo).forEach(([m, d]) => {
            row(m, `$${d.cobrado.toFixed(2)}  (${d.count} venta${d.count!==1?'s':''})`);
        });
    }

    // ── Por canal ──
    section('Ventas por canal de origen');
    if (Object.keys(cierre.porCanal).length === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(MUTED);
        doc.text('Sin datos de canal.', mg, y); y += 7;
    } else {
        Object.entries(cierre.porCanal).forEach(([c, d]) => {
            row(`${c}  (${d.count} vta${d.count!==1?'s':''})`,
                `Total $${d.total.toFixed(2)} · Cobrado $${d.cobrado.toFixed(2)}`);
        });
    }

    // ── Detalle de ventas ──
    section('Detalle de ventas');
    if (cierre.detalleVentas.length === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(MUTED);
        doc.text('Sin ventas en este día.', mg, y); y += 7;
    }

    cierre.detalleVentas.forEach((v, i) => {
        if (y > 265) { doc.addPage(); y = 20; }

        // Fila alternada
        if (i % 2 === 0) {
            doc.setFillColor(248, 248, 248);
            doc.rect(mg - 2, y - 4, W - mg * 2 + 4, 10, 'F');
        }

        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK);
        doc.text(v.clienteNombre, mg, y);

        doc.setFont('helvetica', 'normal'); setColor(MUTED);
        const hora   = new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const canal  = v.canal || 'Mostrador';
        const metodo = v.metodoPago || 'Efectivo';
        doc.text(`${hora}  ·  ${canal}  ·  ${metodo}`, mg, y + 4.5);

        doc.setFont('helvetica', 'bold');
        setColor(v.saldoPendiente > 0 ? DANGER : OK);
        doc.text(`$${Number(v.total).toFixed(2)}`, col2, y, { align: 'right' });

        if (v.saldoPendiente > 0) {
            setColor(DANGER); doc.setFontSize(8);
            doc.text(`Saldo $${v.saldoPendiente.toFixed(2)}`, col2, y + 4.5, { align: 'right' });
        }
        y += 13;
    });

    // ── Pie ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(MUTED);
        doc.text(`Generado el ${new Date().toLocaleString('es-AR')}  —  Gestión de Pastas Pro`, mg, 290);
        doc.text(`Página ${p} de ${totalPages}`, col2, 290, { align: 'right' });
    }

    const nombreArchivo = `cierre-caja-${fecha}.pdf`;
    doc.save(nombreArchivo);
}

// ══════════════════════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════════════════════
function renderClientes(busqueda = '') {
    const clientes  = DB.get('clientes');
    const filtrados = busqueda
        ? clientes.filter(c =>
            `${c.nombre} ${c.apellido||''} ${c.telefono||''} ${c.estado||''}`
            .toLowerCase().includes(busqueda.toLowerCase()))
        : clientes;

    let html = `<div class="search-wrap">
        <span class="material-icons-round">search</span>
        <input type="text" class="form-control" placeholder="Buscar cliente..."
               value="${busqueda}" oninput="window.app.buscarCliente(this.value)">
    </div>`;

    if (filtrados.length === 0) {
        html += `<p class="card-subtitle" style="text-align:center;padding:20px">No se encontraron clientes.</p>`;
    }

    filtrados.forEach(c => {
        const isMay    = c.tipoPrecio === 'mayorista';
        const tipoBadge = isMay ? `<span class="badge gold">Mayorista</span>` : '';
        const tagBadge  = c.estado ? `<span class="badge info">${c.estado}</span>` : '';
        const movs      = c.movimientos || [];
        const ultimos   = movs.slice(-6).reverse();

        const movHTML = movs.length > 0 ? `
        <div class="mov-timeline" id="mov-${c.id}" style="display:none">
            ${ultimos.map(m => {
                const fecha   = new Date(m.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
                const esCargo = m.cargo > 0;
                const imp     = esCargo ? m.cargo : m.abono;
                const met     = m.metodoPago ? ` · ${m.metodoPago}` : '';
                return `<div class="mov-item">
                    <span class="mov-fecha">${fecha}</span>
                    <span class="mov-desc">${m.descripcion}${met}</span>
                    <span class="${esCargo?'mov-cargo':'mov-abono'}">${esCargo?'-':'+'}$${imp}</span>
                </div>`;
            }).join('')}
            <div class="mov-saldo-total">Saldo: $${c.deuda||0}</div>
        </div>` : '';

        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div class="card-title">${c.nombre} ${c.apellido||''}</div>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;margin:4px 0">${tipoBadge}${tagBadge}</div>
                    <div style="font-size:13px;color:var(--text-muted)">${c.telefono||''}</div>
                    <div style="color:${c.deuda>0?'var(--danger)':'var(--success)'};font-weight:bold;margin-top:4px">
                        Deuda: $${c.deuda||0}
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
//  PRODUCTOS
// ══════════════════════════════════════════════════════════
function renderProductos() {
    const productos = DB.get('productos');
    let html = '';
    if (productos.length === 0) html = `<p class="card-subtitle">No hay productos aún.</p>`;
    productos.forEach(p => {
        const sc   = p.stock <= p.stockMinimo ? 'danger' : 'success';
        const diff = Number(p.precioMayorista) !== Number(p.precio);
        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div class="card-title">${p.nombre}</div>
                <span class="badge ${sc}">Stock: ${p.stock}</span>
            </div>
            <div class="card-subtitle">${p.categoria} · Mín: ${p.stockMinimo}</div>
            <div style="display:flex;gap:14px;margin-top:4px">
                <div style="font-size:14px">Min: <b>$${p.precio}</b></div>
                <div style="font-size:14px;color:${diff?'var(--info)':'var(--text-muted)'}">May: <b>$${p.precioMayorista}</b></div>
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
        const date   = new Date(v.createdAt).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});
        const c      = clientes.find(cl => cl.id === v.clienteId);
        const nombre = c ? `${c.nombre} ${c.apellido||''}`.trim() : 'Consumidor final';
        const items  = (v.items||[]).map(i=>`${i.cantidad}x ${i.nombreProducto}`).join(', ');
        const canal  = v.canal || 'Mostrador';
        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div class="card-title">${nombre}</div>
                <span class="badge ${v.saldoPendiente>0?'danger':'success'}">${v.estado}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <span class="canal-${canal.replace(/\s/g,'')}">${canal}</span>
                <span style="color:var(--text-muted);font-size:12px">${date}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${items}</div>
            <div style="display:flex;gap:10px;font-size:13px;flex-wrap:wrap">
                <span>Total: <b>$${v.total}</b></span>
                <span style="color:var(--success)">Pagado: $${v.montoPagado}</span>
                ${v.saldoPendiente>0?`<span style="color:var(--danger)">Saldo: $${v.saldoPendiente}</span>`:''}
                <span class="badge info" style="font-size:10px">${v.metodoPago||'Efectivo'}</span>
                ${v.descuento>0?`<span class="badge gold" style="font-size:10px">${v.descuento}% dto.</span>`:''}
            </div>
            ${v.notas?`<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">"${v.notas}"</div>`:''}
            <div class="action-row">
                <button class="icon-btn success" onclick="window.wpp.sendOrderReady('${nombre}','${c?.telefono||''}')">
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
        {key:'pendiente',label:'Pendientes'},
        {key:'listo',    label:'Listos'},
        {key:'entregado',label:'Entregados'},
        {key:'cancelado',label:'Cancelados'},
        {key:'todos',    label:'Todos'},
    ];

    const filtrados = _pedidoFiltro === 'todos' ? pedidos : pedidos.filter(p => p.estado === _pedidoFiltro);
    const pendCount = pedidos.filter(p => p.estado === 'pendiente').length;
    const hoyCount  = pedidos.filter(p => p.estado === 'pendiente' && new Date(p.fechaEntrega).toDateString() === hoyStr).length;

    const tabsHTML = filtros.map(f => {
        const n = f.key === 'todos' ? pedidos.length : pedidos.filter(p => p.estado === f.key).length;
        return `<button class="filter-tab ${_pedidoFiltro===f.key?'active':''}" onclick="window.app.filtrarPedidos('${f.key}')">
            ${f.label} <span class="tab-count">${n}</span>
        </button>`;
    }).join('');

    let html = '';
    if (pendCount > 0) {
        html += `<div class="card" style="background:rgba(212,175,55,0.07);border:1px solid rgba(212,175,55,0.2);margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:600;font-size:15px">${pendCount} pendiente${pendCount!==1?'s':''}</div>
                    ${hoyCount>0?`<div style="color:var(--danger);font-size:13px;margin-top:2px">⚠ ${hoyCount} para hoy</div>`:''}
                </div>
                <span class="material-icons-round" style="font-size:30px;color:var(--primary-gold);opacity:0.4">assignment</span>
            </div>
        </div>`;
    }

    html += `<div class="filter-tabs">${tabsHTML}</div>`;
    if (filtrados.length === 0) html += `<p class="card-subtitle" style="text-align:center;padding:20px">No hay pedidos aquí.</p>`;

    const estadoMap = {
        pendiente: {badge:'info',    label:'Pendiente'},
        listo:     {badge:'success', label:'✓ Listo'},
        entregado: {badge:'',        label:'Entregado'},
        cancelado: {badge:'danger',  label:'Cancelado'},
    };

    [...filtrados].reverse().forEach(p => {
        const c       = clientes.find(cl => cl.id === p.clienteId);
        const nombre  = c ? `${c.nombre} ${c.apellido||''}`.trim() : 'Sin cliente';
        const fecha   = new Date(p.fechaEntrega+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
        const esHoy   = new Date(p.fechaEntrega).toDateString() === hoyStr;
        const past    = new Date(p.fechaEntrega) < new Date() && p.estado==='pendiente' && !esHoy;
        const items   = (p.items||[]).map(i=>`${i.cantidad}x ${i.nombreProducto}`).join(', ');
        const canal   = p.canal || 'WhatsApp';
        const {badge, label} = estadoMap[p.estado] || {badge:'',label:p.estado};

        html += `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1;margin-right:8px">
                    <div class="card-title">${nombre}</div>
                    <div style="display:flex;gap:6px;align-items:center;margin:4px 0">
                        <span class="canal-${canal.replace(/\s/g,'')}">${canal}</span>
                        <span style="font-size:12px;color:${past?'var(--danger)':esHoy?'var(--primary-gold)':'var(--text-muted)'}">
                            ${past?'⚠ ':''}${fecha}${esHoy?' — HOY':''}
                        </span>
                    </div>
                    <div class="card-subtitle" style="margin-bottom:0">${items}</div>
                </div>
                <span class="badge ${badge}">${label}</span>
            </div>
            ${p.notas?`<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">"${p.notas}"</div>`:''}
            ${p.descuento>0?`<div style="font-size:12px;color:var(--primary-gold);margin-top:4px">${p.descuento}% de descuento</div>`:''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;border-top:1px solid #2a2a2a;padding-top:10px">
                <div style="font-size:20px;font-weight:bold">$${p.total}</div>
                <div style="display:flex;gap:4px">
                    ${p.estado==='pendiente'?`
                    <button class="icon-btn gold" title="Listo" onclick="window.app.marcarListo('${p.id}')">
                        <span class="material-icons-round">check_circle</span>
                    </button>
                    <button class="icon-btn danger" title="Cancelar" onclick="window.app.cancelarPedido('${p.id}')">
                        <span class="material-icons-round">cancel</span>
                    </button>`:''}
                    ${p.estado==='listo'?`
                    <button class="icon-btn success" title="Entregar y cobrar" onclick="window.app.abrirEntrega('${p.id}')">
                        <span class="material-icons-round">local_shipping</span>
                    </button>`:''}
                    ${c?.telefono?`
                    <button class="icon-btn" title="WhatsApp" onclick="window.app.wppPedido('${p.id}')">
                        <span class="material-icons-round">chat</span>
                    </button>`:''}
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
    const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0];
}
function getPrecioItem(p) {
    return _formClienteTipo === 'mayorista' ? (Number(p.precioMayorista)||Number(p.precio)) : Number(p.precio);
}

function canalPills(inputId, defaultVal = 'Mostrador') {
    return `<div class="pill-group">
        ${CANALES_ORIGEN.map(c =>
            `<button type="button" class="pill ${c===defaultVal?'active':''}"
                     data-value="${c}" onclick="window.app.selectPill(this,'${inputId}')">${c}</button>`
        ).join('')}
    </div>
    <input type="hidden" id="${inputId}" value="${defaultVal}">`;
}
function metodoPills(inputId, defaultVal = 'Efectivo') {
    return `<div class="pill-group">
        ${METODOS_PAGO.map(m =>
            `<button type="button" class="pill ${m===defaultVal?'active':''}"
                     data-value="${m}" onclick="window.app.selectPill(this,'${inputId}')">${m}</button>`
        ).join('')}
    </div>
    <input type="hidden" id="${inputId}" value="${defaultVal}">`;
}

function renderVentaItemsForm(productos) {
    const c = document.getElementById('venta-items-container');
    if (!c) return;
    c.innerHTML = _ventaItems.map((item, idx) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <select class="form-control" style="flex:1" onchange="window.app.updateVentaItem(${idx},this.value)">
            <option value="">Elegir producto...</option>
            ${productos.filter(p => p.stock > 0 || p.id === item.productoId).map(p => {
                const pr = getPrecioItem(p);
                return `<option value="${p.id}|||${p.nombre}|||${p.precio}|||${p.precioMayorista||p.precio}"
                    ${item.productoId===p.id?'selected':''}>
                    ${p.nombre} · $${pr} (${p.stock} disp.)
                </option>`;
            }).join('')}
        </select>
        <input type="number" class="form-control" style="width:64px;flex:none" value="${item.cantidad}" min="1"
               oninput="window.app.updateVentaQty(${idx},Number(this.value))">
        ${_ventaItems.length>1?`
        <button type="button" class="icon-btn danger" style="flex:none" onclick="window.app.removeVentaItem(${idx})">
            <span class="material-icons-round">close</span>
        </button>`:''}
    </div>`).join('');
    updateVentaTotalDisplay();
}

function updateVentaTotalDisplay() {
    const dto   = Number(document.getElementById('v-descuento')?.value) || 0;
    const pago  = Number(document.getElementById('v-pago')?.value)      || 0;
    const bruto = _ventaItems.reduce((s,i)=>s+(i.precioUnitario||0)*(i.cantidad||0),0);
    const total = bruto * (1 - dto/100);
    const saldo = Math.max(0, total - pago);
    const elT = document.getElementById('venta-total');
    const elS = document.getElementById('venta-saldo');
    if (elT) elT.textContent = `$${total.toFixed(0)}${dto>0?` (-${dto}%)`:''}`;
    if (elS) elS.textContent = `Saldo pendiente: $${saldo.toFixed(0)}`;
}

function renderPedidoItemsForm(productos) {
    const c = document.getElementById('pedido-items-container');
    if (!c) return;
    c.innerHTML = _pedidoItems.map((item, idx) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <select class="form-control" style="flex:1" onchange="window.app.updatePedidoItem(${idx},this.value)">
            <option value="">Elegir producto...</option>
            ${productos.map(p => {
                const pr = getPrecioItem(p);
                return `<option value="${p.id}|||${p.nombre}|||${p.precio}|||${p.precioMayorista||p.precio}"
                    ${item.productoId===p.id?'selected':''}>
                    ${p.nombre} · $${pr}
                </option>`;
            }).join('')}
        </select>
        <input type="number" class="form-control" style="width:64px;flex:none" value="${item.cantidad}" min="1"
               oninput="window.app.updatePedidoQty(${idx},Number(this.value))">
        ${_pedidoItems.length>1?`
        <button type="button" class="icon-btn danger" style="flex:none" onclick="window.app.removePedidoItem(${idx})">
            <span class="material-icons-round">close</span>
        </button>`:''}
    </div>`).join('');
    updatePedidoTotalDisplay();
}

function updatePedidoTotalDisplay() {
    const dto   = Number(document.getElementById('p-descuento')?.value) || 0;
    const bruto = _pedidoItems.reduce((s,i)=>s+(i.precioUnitario||0)*(i.cantidad||0),0);
    const total = bruto*(1-dto/100);
    const el    = document.getElementById('pedido-total');
    if (el) el.textContent = `$${total.toFixed(0)}${dto>0?` (-${dto}%)`:''}`;
}

// ══════════════════════════════════════════════════════════
//  MODAL CIERRE DE CAJA
// ══════════════════════════════════════════════════════════
function abrirCierreCaja() {
    modal.classList.remove('hidden');
    modalTitle.innerText = 'Cierre de caja';
    const hoy = new Date().toISOString().split('T')[0];

    modalBody.innerHTML = `
    <form id="form-data">
        <div class="form-group">
            <label>Fecha del cierre</label>
            <input type="date" id="cierre-fecha" class="form-control" value="${hoy}" required>
        </div>
        <div id="cierre-preview" style="margin-top:12px"></div>
        <button type="button" class="btn-secondary" style="margin-top:8px"
                onclick="window.app.previewCierre()">
            Ver resumen
        </button>
        <button type="submit" class="btn-primary">
            <span style="display:flex;align-items:center;justify-content:center;gap:6px">
                <span class="material-icons-round" style="font-size:18px">picture_as_pdf</span>
                Descargar PDF
            </span>
        </button>
    </form>`;

    document.getElementById('form-data').onsubmit = async (e) => {
        e.preventDefault();
        const fecha = document.getElementById('cierre-fecha').value;
        try {
            await generarCierrePDF(fecha);
        } catch (err) {
            alert('Error al generar PDF: ' + err.message);
        }
    };
}

window.app = window.app || {};

// preview inline del cierre antes de generar PDF
window.app.previewCierre = () => {
    const fecha  = document.getElementById('cierre-fecha')?.value;
    if (!fecha) return;
    const cierre = DB.getCierreCaja(fecha);
    const fLabel = new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});

    const metodosHTML = Object.entries(cierre.porMetodo)
        .map(([m, d]) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
            <span style="color:var(--text-muted)">${m}</span>
            <span>$${d.cobrado.toFixed(0)} (${d.count} vta${d.count!==1?'s':''})</span>
        </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px">Sin ventas.</div>';

    const canalesHTML = Object.entries(cierre.porCanal)
        .map(([c, d]) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
            <span class="canal-${c.replace(/\s/g,'')}">${c}</span>
            <span>$${d.total.toFixed(0)} · cobrado $${d.cobrado.toFixed(0)}</span>
        </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px">Sin datos.</div>';

    document.getElementById('cierre-preview').innerHTML = `
    <div style="background:#111;border-radius:10px;padding:14px;margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:capitalize">${fLabel}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:var(--text-muted)">Ventas</span><span>${cierre.cantVentas}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:var(--text-muted)">Total facturado</span>
            <span style="font-weight:bold">$${cierre.totalBruto.toFixed(0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:var(--text-muted)">Cobrado</span>
            <span style="color:var(--success);font-weight:bold">$${cierre.totalCobrado.toFixed(0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            <span style="color:var(--text-muted)">Pendiente</span>
            <span style="color:var(--danger);font-weight:bold">$${cierre.totalPendiente.toFixed(0)}</span>
        </div>
        <div style="border-top:1px solid #2a2a2a;padding-top:10px;margin-bottom:6px;font-size:12px;color:var(--text-muted)">Por método</div>
        ${metodosHTML}
        <div style="border-top:1px solid #2a2a2a;padding-top:10px;margin-top:8px;margin-bottom:6px;font-size:12px;color:var(--text-muted)">Por canal</div>
        ${canalesHTML}
    </div>`;
};

// ══════════════════════════════════════════════════════════
//  MODALES CRUD
// ══════════════════════════════════════════════════════════
function openModal(view, idToEdit = null) {
    modal.classList.remove('hidden');
    _formClienteTipo = 'minorista';

    if (view === 'cierre-caja') { abrirCierreCaja(); return; }

    if (view === 'clientes') {
        const c    = idToEdit ? DB.getById('clientes', idToEdit) : {};
        const tipo = c.tipoPrecio || 'minorista';
        modalTitle.innerText = idToEdit ? 'Editar cliente' : 'Nuevo cliente';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Nombre</label>
                <input type="text" id="f-nombre" class="form-control" required value="${c.nombre||''}"></div>
            <div class="form-group"><label>Apellido</label>
                <input type="text" id="f-apellido" class="form-control" value="${c.apellido||''}"></div>
            <div class="form-group"><label>Teléfono (WhatsApp)</label>
                <input type="tel" id="f-tel" class="form-control" required value="${c.telefono||''}"></div>
            <div class="form-group"><label>Etiqueta</label>
                <input type="text" id="f-estado" class="form-control" value="${c.estado||''}" placeholder="Frecuente, Restaurante..."></div>
            <div class="form-group"><label>Tipo de precio</label>
                <div class="pill-group">
                    <button type="button" class="pill ${tipo==='minorista'?'active':''}" data-value="minorista" onclick="window.app.selectPill(this,'f-tipo')">Minorista</button>
                    <button type="button" class="pill ${tipo==='mayorista'?'active':''}" data-value="mayorista" onclick="window.app.selectPill(this,'f-tipo')">Mayorista</button>
                </div>
                <input type="hidden" id="f-tipo" value="${tipo}">
            </div>
            ${idToEdit?`<div class="form-group"><label>Ajustar deuda ($)</label>
                <input type="number" id="f-deuda" class="form-control" value="${c.deuda||0}"></div>`:''}
            <button type="submit" class="btn-primary">${idToEdit?'Actualizar':'Guardar'}</button>
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
            idToEdit ? DB.update('clientes',idToEdit,data) : DB.add('clientes',data);
            modal.classList.add('hidden');
            renderClientes();
        };
    }

    else if (view === 'productos') {
        const p = idToEdit ? DB.getById('productos', idToEdit) : {};
        modalTitle.innerText = idToEdit ? 'Editar producto' : 'Nuevo producto';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Nombre</label>
                <input type="text" id="f-nombre" class="form-control" required value="${p.nombre||''}"></div>
            <div class="form-group"><label>Categoría</label>
                <input type="text" id="f-cat" class="form-control" required value="${p.categoria||''}"></div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Precio minorista ($)</label>
                    <input type="number" id="f-precio" class="form-control" required value="${p.precio||''}"></div>
                <div class="form-group"><label>Precio mayorista ($)</label>
                    <input type="number" id="f-pmay" class="form-control" value="${p.precioMayorista??p.precio??''}"></div>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Stock actual</label>
                    <input type="number" id="f-stock" class="form-control" required value="${p.stock??''}"></div>
                <div class="form-group"><label>Stock mínimo</label>
                    <input type="number" id="f-min" class="form-control" value="${p.stockMinimo??5}"></div>
            </div>
            <button type="submit" class="btn-primary">${idToEdit?'Actualizar':'Guardar'}</button>
        </form>`;

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const precio = Number(document.getElementById('f-precio').value);
            const pmay   = Number(document.getElementById('f-pmay').value) || precio;
            const data   = {
                nombre:          document.getElementById('f-nombre').value.trim(),
                categoria:       document.getElementById('f-cat').value.trim(),
                precio, precioMayorista: pmay,
                stock:           Number(document.getElementById('f-stock').value),
                stockMinimo:     Number(document.getElementById('f-min').value),
            };
            idToEdit ? DB.update('productos',idToEdit,data) : DB.add('productos',data);
            modal.classList.add('hidden');
            renderProductos();
        };
    }

    else if (view === 'ventas' || view === 'home') {
        const clientes  = DB.get('clientes');
        const productos = DB.get('productos');
        _ventaItems     = [{productoId:'',cantidad:1,nombreProducto:'',precioUnitario:0}];
        modalTitle.innerText = 'Registrar venta';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Cliente</label>
                <select id="v-cliente" class="form-control" onchange="window.app.onClienteChange(this.value,'venta')">
                    <option value="">Consumidor final</option>
                    ${clientes.map(c=>`<option value="${c.id}">${c.nombre} ${c.apellido||''}${c.tipoPrecio==='mayorista'?' [May]':''}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Canal de origen</label>
                ${canalPills('v-canal','Mostrador')}
            </div>
            <div class="form-group"><label>Productos</label>
                <div id="venta-items-container"></div>
                <button type="button" class="btn-secondary" style="padding:7px 14px;font-size:13px;margin-top:4px"
                        onclick="window.app.addVentaItem()">+ Agregar ítem</button>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Descuento (%)</label>
                    <input type="number" id="v-descuento" class="form-control" value="0" min="0" max="100"
                           oninput="window.updateVentaTotalDisplay()"></div>
                <div class="form-group"><label>Pagado ahora ($)</label>
                    <input type="number" id="v-pago" class="form-control" value="0" min="0"
                           oninput="window.updateVentaTotalDisplay()"></div>
            </div>
            <div class="form-group"><label>Método de pago</label>
                ${metodoPills('v-metodo')}
            </div>
            <div class="form-group"><label>Notas (opcional)</label>
                <input type="text" id="v-notas" class="form-control" placeholder="Entrega a domicilio, sin sal...">
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
            const validItems = _ventaItems.filter(i=>i.productoId);
            if (validItems.length===0){alert('Agregá al menos un producto.');return;}
            const clienteId  = document.getElementById('v-cliente').value;
            const canal      = document.getElementById('v-canal').value;
            const descuento  = Number(document.getElementById('v-descuento').value)||0;
            const pagado     = Number(document.getElementById('v-pago').value)||0;
            const metodoPago = document.getElementById('v-metodo').value;
            const notas      = document.getElementById('v-notas').value.trim();
            const bruto      = validItems.reduce((s,i)=>s+i.precioUnitario*i.cantidad,0);
            const total      = bruto*(1-descuento/100);
            try {
                DB.crearVenta({clienteId:clienteId||null,items:validItems,total,montoPagado:pagado,metodoPago,canal,notas,descuento});
                modal.classList.add('hidden');
                const c = clientes.find(cl=>cl.id===clienteId);
                if (c?.telefono && confirm('Venta registrada. ¿Enviar comprobante por WhatsApp?')) {
                    const txt = validItems.map(i=>`${i.cantidad}x ${i.nombreProducto}`).join(', ');
                    WhatsApp.sendOrderDetails(c.nombre,c.telefono,txt,total.toFixed(0),metodoPago);
                }
                currentView==='ventas'?renderVentas():renderView('home');
            } catch(err){alert('Error: '+err.message);}
        };
    }

    else if (view === 'pedidos') {
        const clientes  = DB.get('clientes');
        const productos = DB.get('productos');
        _pedidoItems    = [{productoId:'',cantidad:1,nombreProducto:'',precioUnitario:0}];
        modalTitle.innerText = 'Nuevo pedido / encargo';
        modalBody.innerHTML = `
        <form id="form-data">
            <div class="form-group"><label>Cliente</label>
                <select id="p-cliente" class="form-control" onchange="window.app.onClienteChange(this.value,'pedido')">
                    <option value="">Sin asignar</option>
                    ${clientes.map(c=>`<option value="${c.id}">${c.nombre} ${c.apellido||''}${c.tipoPrecio==='mayorista'?' [May]':''}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Canal de origen</label>
                ${canalPills('p-canal','WhatsApp')}
            </div>
            <div class="form-group"><label>Productos</label>
                <div id="pedido-items-container"></div>
                <button type="button" class="btn-secondary" style="padding:7px 14px;font-size:13px;margin-top:4px"
                        onclick="window.app.addPedidoItem()">+ Agregar ítem</button>
            </div>
            <div style="display:flex;gap:10px">
                <div class="form-group"><label>Fecha de entrega</label>
                    <input type="date" id="p-fecha" class="form-control" value="${getTomorrow()}" required></div>
                <div class="form-group"><label>Descuento (%)</label>
                    <input type="number" id="p-descuento" class="form-control" value="0" min="0" max="100"
                           oninput="window.app.updatePedidoDesc()"></div>
            </div>
            <div class="form-group"><label>Notas (opcional)</label>
                <input type="text" id="p-notas" class="form-control" placeholder="Sin sal, fideos cortos..."></div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #2a2a2a">
                <span style="color:var(--text-muted)">Total estimado</span>
                <div id="pedido-total" style="font-size:24px;font-weight:bold;color:var(--primary-gold)">$0</div>
            </div>
            <button type="submit" class="btn-primary">Guardar pedido</button>
        </form>`;

        renderPedidoItemsForm(productos);

        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const validItems = _pedidoItems.filter(i=>i.productoId);
            if (validItems.length===0){alert('Agregá al menos un producto.');return;}
            const clienteId = document.getElementById('p-cliente').value;
            const canal     = document.getElementById('p-canal').value;
            const descuento = Number(document.getElementById('p-descuento').value)||0;
            const fecha     = document.getElementById('p-fecha').value;
            const notas     = document.getElementById('p-notas').value.trim();
            const bruto     = validItems.reduce((s,i)=>s+i.precioUnitario*i.cantidad,0);
            const total     = bruto*(1-descuento/100);
            DB.crearPedido({clienteId:clienteId||null,items:validItems,fechaEntrega:fecha,notas,total,descuento,canal});
            modal.classList.add('hidden');
            const c = clientes.find(cl=>cl.id===clienteId);
            if (c?.telefono && confirm('Pedido guardado. ¿Enviar confirmación por WhatsApp?')) {
                const txt = validItems.map(i=>`${i.cantidad}x ${i.nombreProducto}`).join('\n');
                WhatsApp.sendPedidoConfirmacion(c.nombre,c.telefono,txt,total.toFixed(0),fecha);
            }
            currentView==='pedidos'?renderPedidos():renderView('home');
        };
    }

    else if (view === 'pago') {
        const c = DB.getById('clientes', idToEdit);
        if (!c) return;
        modalTitle.innerText = 'Registrar pago';
        modalBody.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;padding:14px;background:rgba(207,102,121,0.1);border-radius:12px">
            <div style="color:var(--text-muted);font-size:13px">Deuda de ${c.nombre}</div>
            <div style="font-size:36px;font-weight:bold;color:var(--danger)">$${c.deuda||0}</div>
        </div>
        <form id="form-data">
            <div class="form-group"><label>Monto cobrado ($)</label>
                <input type="number" id="pago-monto" class="form-control" value="${c.deuda||0}" min="0.01" step="0.01" required></div>
            <div class="form-group"><label>Método de pago</label>
                ${metodoPills('pago-metodo')}
            </div>
            <button type="submit" class="btn-primary">✓ Confirmar pago</button>
        </form>`;
        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            const monto  = Number(document.getElementById('pago-monto').value);
            const metodo = document.getElementById('pago-metodo').value;
            DB.registrarPago(idToEdit,monto,metodo,metodo);
            modal.classList.add('hidden');
            renderClientes();
        };
    }

    else if (view === 'entregar-pedido') {
        const p = DB.getById('pedidos', idToEdit);
        if (!p) return;
        const c     = DB.getById('clientes', p.clienteId);
        const items = (p.items||[]).map(i=>`${i.cantidad}x ${i.nombreProducto}`).join(', ');
        modalTitle.innerText = 'Registrar entrega';
        modalBody.innerHTML = `
        <div style="background:rgba(212,175,55,0.08);border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="font-size:13px;color:var(--text-muted)">Pedido de ${c?c.nombre:'Sin cliente'}</div>
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
                <div class="form-group"><label>Cobrado ahora ($)</label>
                    <input type="number" id="conv-pago" class="form-control" value="${p.total}" min="0"></div>
                <div class="form-group"><label>Método de pago</label>
                    ${metodoPills('conv-metodo')}
                </div>
            </div>
            <button type="submit" class="btn-primary">Confirmar entrega</button>
        </form>`;

        document.getElementById('reg-venta').addEventListener('change', function(){
            document.getElementById('venta-fields').style.display = this.checked?'block':'none';
        });
        document.getElementById('form-data').onsubmit = (e) => {
            e.preventDefault();
            if (document.getElementById('reg-venta').checked) {
                const pago   = Number(document.getElementById('conv-pago').value);
                const metodo = document.getElementById('conv-metodo').value;
                try { DB.convertirPedidoAVenta(idToEdit,pago,metodo); }
                catch(err){ alert('Error: '+err.message); return; }
            } else {
                DB.actualizarEstadoPedido(idToEdit,'entregado');
            }
            modal.classList.add('hidden');
            renderPedidos();
        };
    }
}

// ══════════════════════════════════════════════════════════
//  EXPOSICIÓN GLOBAL
// ══════════════════════════════════════════════════════════
window.wpp                    = WhatsApp;
window.updateVentaTotalDisplay = updateVentaTotalDisplay;

window.app = {
    openModal:    (v)   => openModal(v),
    setHomeTab:   (tab) => { _homeTab = tab; renderHome(); },
    abrirCierreCaja: ()  => abrirCierreCaja(),
    previewCierre: () => window.app.previewCierre(),

    // Clientes
    editCliente:   (id) => openModal('clientes', id),
    deleteCliente: (id) => { if(confirm('¿Eliminar cliente y su historial?')){ DB.delete('clientes',id); renderClientes(); } },
    buscarCliente: (q)  => renderClientes(q),
    toggleMovimientos: (id) => { const el=document.getElementById(`mov-${id}`); if(el) el.style.display=el.style.display==='none'?'block':'none'; },
    openPagoModal: (id) => openModal('pago', id),
    enviarResumenDeuda: (id) => {
        const c = DB.getById('clientes', id);
        if (!c?.telefono){ alert('El cliente no tiene teléfono.'); return; }
        WhatsApp.sendResumenDeuda(c.nombre,c.telefono,c.movimientos||[],c.deuda||0);
    },

    // Productos
    editProducto:   (id) => openModal('productos', id),
    deleteProducto: (id) => { if(confirm('¿Eliminar producto?')){ DB.delete('productos',id); renderProductos(); } },

    // Ventas
    deleteVenta: (id) => { if(confirm('Al eliminar la venta el stock y la deuda se revierten. ¿Proceder?')){ DB.eliminarVenta(id); renderVentas(); } },

    // Pedidos
    filtrarPedidos: (f) => { _pedidoFiltro=f; renderPedidos(); },
    marcarListo: (id) => {
        DB.actualizarEstadoPedido(id,'listo');
        const p=DB.getById('pedidos',id); const c=DB.getById('clientes',p?.clienteId);
        if(c?.telefono && confirm('¿Avisar al cliente por WhatsApp?')){
            const txt=(p.items||[]).map(i=>`${i.cantidad}x ${i.nombreProducto}`).join('\n');
            WhatsApp.sendPedidoListo(c.nombre,c.telefono,txt);
        }
        renderPedidos();
    },
    abrirEntrega:  (id) => openModal('entregar-pedido', id),
    cancelarPedido:(id) => { if(confirm('¿Cancelar pedido?')){ DB.cancelarPedido(id); renderPedidos(); } },
    wppPedido: (id) => {
        const p=DB.getById('pedidos',id); const c=DB.getById('clientes',p?.clienteId);
        if(!c?.telefono) return;
        const txt=(p.items||[]).map(i=>`${i.cantidad}x ${i.nombreProducto}`).join('\n');
        p.estado==='listo'
            ? WhatsApp.sendPedidoListo(c.nombre,c.telefono,txt)
            : WhatsApp.sendPedidoConfirmacion(c.nombre,c.telefono,txt,p.total,p.fechaEntrega);
    },
    deletePedido: (id) => { if(confirm('¿Eliminar pedido?')){ DB.eliminarPedido(id); renderPedidos(); } },

    // Items venta
    addVentaItem: () => { _ventaItems.push({productoId:'',cantidad:1,nombreProducto:'',precioUnitario:0}); renderVentaItemsForm(DB.get('productos')); },
    updateVentaItem: (idx,val) => {
        if(!val){ _ventaItems[idx]={productoId:'',cantidad:_ventaItems[idx].cantidad,nombreProducto:'',precioUnitario:0}; updateVentaTotalDisplay(); return; }
        const [pid,nombre,pMin,pMay]=val.split('|||');
        const precio=_formClienteTipo==='mayorista'?Number(pMay):Number(pMin);
        _ventaItems[idx]={..._ventaItems[idx],productoId:pid,nombreProducto:nombre,precioUnitario:precio};
        updateVentaTotalDisplay();
    },
    updateVentaQty: (idx,cant) => { _ventaItems[idx].cantidad=cant; updateVentaTotalDisplay(); },
    removeVentaItem:(idx)      => { _ventaItems.splice(idx,1); renderVentaItemsForm(DB.get('productos')); },

    // Items pedido
    addPedidoItem: () => { _pedidoItems.push({productoId:'',cantidad:1,nombreProducto:'',precioUnitario:0}); renderPedidoItemsForm(DB.get('productos')); },
    updatePedidoItem: (idx,val) => {
        if(!val){ _pedidoItems[idx]={productoId:'',cantidad:_pedidoItems[idx].cantidad,nombreProducto:'',precioUnitario:0}; updatePedidoTotalDisplay(); return; }
        const [pid,nombre,pMin,pMay]=val.split('|||');
        const precio=_formClienteTipo==='mayorista'?Number(pMay):Number(pMin);
        _pedidoItems[idx]={..._pedidoItems[idx],productoId:pid,nombreProducto:nombre,precioUnitario:precio};
        updatePedidoTotalDisplay();
    },
    updatePedidoQty: (idx,cant) => { _pedidoItems[idx].cantidad=cant; updatePedidoTotalDisplay(); },
    removePedidoItem:(idx)      => { _pedidoItems.splice(idx,1); renderPedidoItemsForm(DB.get('productos')); },
    updatePedidoDesc: updatePedidoTotalDisplay,

    // Cliente → precio dinámico
    onClienteChange: (clienteId, tipo) => {
        const c=clienteId?DB.getById('clientes',clienteId):null;
        _formClienteTipo=c?.tipoPrecio||'minorista';
        const productos=DB.get('productos');
        const items=tipo==='venta'?_ventaItems:_pedidoItems;
        items.forEach(item=>{
            if(item.productoId){ const p=productos.find(pr=>pr.id===item.productoId); if(p) item.precioUnitario=getPrecioItem(p); }
        });
        tipo==='venta'?renderVentaItemsForm(productos):renderPedidoItemsForm(productos);
    },

    // Sync manual desde botón header
    syncManual: async () => {
        await syncFromCloud();
        renderView(currentView);
    },

    // Pill selector (métodos y canales)
    selectPill: (el, inputId) => {
        el.closest('.pill-group').querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
        el.classList.add('active');
        document.getElementById(inputId).value = el.dataset.value || el.textContent.trim();
    },
};

// fix para que previewCierre funcione bien como método del objeto window.app
window.app.previewCierre = () => {
    const fecha=document.getElementById('cierre-fecha')?.value; if(!fecha) return;
    const cierre=DB.getCierreCaja(fecha);
    const fLabel=new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
    const metodosHTML=Object.entries(cierre.porMetodo).map(([m,d])=>
        `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
            <span style="color:var(--text-muted)">${m}</span>
            <span>$${d.cobrado.toFixed(0)} (${d.count} vta${d.count!==1?'s':''})</span>
        </div>`).join('')||'<div style="color:var(--text-muted);font-size:13px">Sin ventas.</div>';
    const canalesHTML=Object.entries(cierre.porCanal).map(([c,d])=>
        `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
            <span class="canal-${c.replace(/\s/g,'')}">${c}</span>
            <span>$${d.total.toFixed(0)} · cobrado $${d.cobrado.toFixed(0)}</span>
        </div>`).join('')||'<div style="color:var(--text-muted);font-size:13px">Sin datos.</div>';
    document.getElementById('cierre-preview').innerHTML=`
    <div style="background:#111;border-radius:10px;padding:14px;margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:capitalize">${fLabel}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">Ventas</span><span>${cierre.cantVentas}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">Total facturado</span><span style="font-weight:bold">$${cierre.totalBruto.toFixed(0)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-muted)">Cobrado</span><span style="color:var(--success);font-weight:bold">$${cierre.totalCobrado.toFixed(0)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span style="color:var(--text-muted)">Pendiente</span><span style="color:var(--danger);font-weight:bold">$${cierre.totalPendiente.toFixed(0)}</span></div>
        <div style="border-top:1px solid #2a2a2a;padding-top:10px;margin-bottom:6px;font-size:12px;color:var(--text-muted)">Por método</div>
        ${metodosHTML}
        <div style="border-top:1px solid #2a2a2a;padding-top:10px;margin-top:8px;margin-bottom:6px;font-size:12px;color:var(--text-muted)">Por canal</div>
        ${canalesHTML}
    </div>`;
};

renderHome();
