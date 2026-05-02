// =============================
// SCRIPT COBRADOR - FINANZAS JKzas
// ✅ Sincronizado con clientes activos
// ✅ Calcula valor automático
// ✅ Si paga todas las cuotas pendientes, cobra el saldo exacto
// =============================

const cliente = document.getElementById("cliente");
const cuota = document.getElementById("cuota");
const valor = document.getElementById("valor");
const obs = document.getElementById("obs");
const mensaje = document.getElementById("mensaje");

const tbodyPagos = document.querySelector("#tablaHistorial tbody");
const tbodyClientes = document.querySelector("#tablaClientesCobrador tbody");

let clientesData = [];

function num(x) {
  if (x === undefined || x === null || x === "") return 0;

  let txt = String(x).trim().replace("$", "").replace(/\s/g, "");

  if (txt.includes(",") && txt.includes(".")) {
    const ultimaComa = txt.lastIndexOf(",");
    const ultimoPunto = txt.lastIndexOf(".");

    if (ultimaComa > ultimoPunto) {
      txt = txt.replace(/\./g, "").replace(",", ".");
    } else {
      txt = txt.replace(/,/g, "");
    }
  } else if (txt.includes(",")) {
    txt = txt.replace(",", ".");
  }

  return parseFloat(txt) || 0;
}

function money(n) {
  return "$" + num(n).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizarTexto(t) {
  return String(t || "").trim().toLowerCase();
}

window.addEventListener("load", async () => {
  await cargarClientes();
  await cargarPagos();
});

// =============================
// CARGAR CLIENTES ACTIVOS
// =============================
async function cargarClientes() {
  try {
    const resp = await fetch("/api/datos");
    const data = await resp.json();

    clientesData = data.datos || [];
    tbodyClientes.innerHTML = "";

    clientesData.slice(1).forEach(c => {
      if (!c[0]) return;

      const estado = normalizarTexto(c[10]);
      const saldo = num(c[9]);

      if (estado === "pagado" || estado === "eliminado" || saldo <= 0) return;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${c[0]}</td>
        <td>${c[1]}</td>
        <td>${c[2]}</td>
        <td>${c[6]}</td>
        <td>${money(c[7])}</td>
        <td>${money(c[8])}</td>
        <td>${money(c[9])}</td>
        <td>${c[10]}</td>
        <td>
          <button class="cobrar" onclick="seleccionarCliente('${c[0]}')">Cobrar</button>
        </td>
      `;

      tbodyClientes.appendChild(tr);
    });

    if (!tbodyClientes.children.length) {
      tbodyClientes.innerHTML =
        "<tr><td colspan='9'>No hay clientes activos para cobrar.</td></tr>";
    }

  } catch (err) {
    console.error(err);
    tbodyClientes.innerHTML =
      "<tr><td colspan='9'>❌ Error cargando clientes.</td></tr>";
  }
}

// =============================
// SELECCIONAR CLIENTE
// =============================
function seleccionarCliente(codigo) {
  cliente.value = codigo;
  cuota.value = "1";
  obs.value = "";
  calcularValorAutomatico();
}

// =============================
// BUSCAR CLIENTE ACTIVO
// =============================
function buscarClienteActivo(valorBuscado) {
  const key = normalizarTexto(valorBuscado);

  return clientesData
    .slice(1)
    .reverse()
    .find(c => {
      if (!c[0]) return false;

      const codigo = normalizarTexto(c[0]);
      const nombre = normalizarTexto(c[1]);
      const estado = normalizarTexto(c[10]);
      const saldo = num(c[9]);

      return (
        (codigo === key || nombre === key) &&
        estado !== "pagado" &&
        estado !== "eliminado" &&
        saldo > 0
      );
    });
}

// =============================
// CALCULAR VALOR AUTOMÁTICO
// =============================
function calcularValorAutomatico() {
  const cli = cliente.value.trim();
  const cantidad = num(cuota.value);

  if (!cli || cantidad <= 0) {
    valor.value = "";
    return;
  }

  const c = buscarClienteActivo(cli);

  if (!c) {
    valor.value = "";
    return;
  }

  const cuotasPendientes = num(c[6]);
  const valorUnitario = num(c[7]);
  const saldo = num(c[9]);

  let totalPago = valorUnitario * cantidad;

  // ✅ SI PAGA TODAS LAS CUOTAS PENDIENTES, COBRA SALDO EXACTO
  if (cantidad >= cuotasPendientes) {
    totalPago = saldo;
  }

  // ✅ NUNCA DEJA COBRAR MÁS DEL SALDO
  if (totalPago > saldo) {
    totalPago = saldo;
  }

  valor.value = Number(totalPago.toFixed(2));
}

cliente.addEventListener("input", calcularValorAutomatico);
cliente.addEventListener("blur", calcularValorAutomatico);
cuota.addEventListener("input", calcularValorAutomatico);

// =============================
// REGISTRAR PAGO
// =============================
document.getElementById("btn-guardar").addEventListener("click", async () => {
  const cli = cliente.value.trim();
  const cuo = num(cuota.value);
  const val = num(valor.value);
  const ob = obs.value.trim();

  if (!cli || cuo <= 0 || val <= 0) {
    mensaje.style.color = "red";
    mensaje.textContent = "⚠️ Completa cliente, cantidad de cuotas/días y valor.";
    return;
  }

  try {
    const resp = await fetch("/api/pagos/agregar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cliente: cli,
        cuota: cuo,
        valor: val,
        observacion: ob,
        fecha: new Date().toLocaleDateString("es-CO"),
      }),
    });

    const text = await resp.text();

    if (!resp.ok) throw new Error(text);

    mensaje.style.color = "green";
    mensaje.textContent = text;

    cliente.value = "";
    cuota.value = "";
    valor.value = "";
    obs.value = "";

    await cargarClientes();
    await cargarPagos();

  } catch (err) {
    mensaje.style.color = "red";
    mensaje.textContent = "❌ " + err.message;
  }
});

// =============================
// CARGAR HISTORIAL DE PAGOS ACTIVOS
// =============================
async function cargarPagos() {
  tbodyPagos.innerHTML = "<tr><td colspan='7'>Cargando pagos...</td></tr>";

  try {
    const respPagos = await fetch("/api/pagos");
    const dataPagos = await respPagos.json();
    const pagos = dataPagos.pagos || [];

    tbodyPagos.innerHTML = "";

    pagos.forEach(p => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${p.rowNumber}</td>
        <td>${p.cliente} - ${p.nombre || ""}</td>
        <td>${p.cuota}</td>
        <td>${money(p.valor)}</td>
        <td>${p.observacion || "-"}</td>
        <td>${p.fecha || ""}</td>
        <td>
          <button class="editar" data-row="${p.rowNumber}">✏️ Editar</button>
        </td>
      `;

      tbodyPagos.appendChild(tr);
    });

    document.querySelectorAll(".editar").forEach(btn =>
      btn.addEventListener("click", e =>
        abrirEdicionPago(parseInt(e.target.dataset.row, 10))
      )
    );

    if (!tbodyPagos.children.length) {
      tbodyPagos.innerHTML =
        "<tr><td colspan='7'>No hay pagos activos para mostrar.</td></tr>";
    }

  } catch (err) {
    console.error(err);
    tbodyPagos.innerHTML =
      "<tr><td colspan='7'>❌ Error cargando pagos.</td></tr>";
  }
}

// =============================
// EDITAR PAGO
// =============================
function abrirEdicionPago(rowNumber) {
  const row = [...tbodyPagos.querySelectorAll("tr")].find(
    tr => parseInt(tr.children[0].textContent, 10) === rowNumber
  );

  if (!row) return;

  const textoCliente = row.children[1].textContent;
  const codigo = textoCliente.split("-")[0].trim();

  cliente.value = codigo;
  cuota.value = row.children[2].textContent;
  valor.value = num(row.children[3].textContent);
  obs.value = row.children[4].textContent;

  const confirmar = confirm("¿Actualizar este pago con los datos cargados arriba?");
  if (!confirmar) return;

  editarPago(rowNumber);
}

async function editarPago(rowNumber) {
  const cli = cliente.value.trim();
  const cuo = num(cuota.value);
  const val = num(valor.value);
  const ob = obs.value.trim();

  if (!cli || cuo <= 0 || val <= 0) {
    alert("⚠️ Faltan datos para editar.");
    return;
  }

  try {
    const resp = await fetch("/api/pagos/editar", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rowNumber,
        cliente: cli,
        cuota: cuo,
        valor: val,
        observacion: ob,
        fecha: new Date().toLocaleDateString("es-CO"),
      }),
    });

    const text = await resp.text();

    if (!resp.ok) throw new Error(text);

    alert(text);

    cliente.value = "";
    cuota.value = "";
    valor.value = "";
    obs.value = "";

    await cargarClientes();
    await cargarPagos();

  } catch (err) {
    alert("❌ " + err.message);
  }
}