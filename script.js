let currentUser = null;
let categories = [];
let entries = [];
let currentCategory = null; // Die aktuell offene Kategorie

// --- Init ---
async function handleLogin() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const res = await fetch('/api/login', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: u, password: p})
    });
    const data = await res.json();
    if(data.success) {
        currentUser = data.username;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('display-username').innerText = currentUser;
        loadData();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

async function loadData() {
    // 1. Kategorien holen (Backend erstellt jetzt Defaults wenn leer!)
    const cRes = await fetch(`/api/categories?user=${currentUser}`);
    categories = await cRes.json();
    
    // 2. Einträge holen
    const eRes = await fetch(`/api/entries?user=${currentUser}`);
    entries = await eRes.json();

    renderSidebar();
    
    // Öffne erste Kategorie standardmäßig
    if(categories.length > 0) openCategory(categories[0]);
}

// --- Sidebar ---
function renderSidebar() {
    const nav = document.getElementById('nav-container');
    nav.innerHTML = '';
    categories.forEach(cat => {
        const a = document.createElement('a');
        a.className = 'nav-item';
        a.id = `nav-cat-${cat.id}`;
        a.innerText = cat.name;
        // Icon Logik (Optional)
        if(cat.special_type === 'fitness') a.innerText += ' 🏃';
        if(cat.special_type === 'nutrition') a.innerText += ' 🍎';
        if(cat.special_type === 'mood') a.innerText += ' 🧠';
        
        a.onclick = () => openCategory(cat);
        nav.appendChild(a);
    });
}

// --- Hauptlogik: Kategorie öffnen ---
function openCategory(cat) {
    currentCategory = cat;
    switchTab('generic');

    document.getElementById('gen-title').innerText = cat.name;
    const widgetArea = document.getElementById('special-widget-container');
    const inputArea = document.getElementById('gen-inputs-container');
    
    widgetArea.innerHTML = ''; 
    inputArea.innerHTML = '';

    // A. Spezial-Widgets rendern (API Suche!)
    if (cat.special_type === 'nutrition') {
        widgetArea.innerHTML = `
            <div style="display:flex; gap:10px; background:#e6fffa; padding:15px; border-radius:8px;">
                <input id="api-search-input" type="text" placeholder="Produkt suchen (z.B. Apfel)..." style="margin:0;">
                <button onclick="runApiSearch()" class="btn-green" style="width:auto;">Suchen</button>
            </div>
            <div id="api-error" style="color:red; margin-top:5px;"></div>
        `;
    }

    // B. Variable Felder rendern
    cat.fields.forEach((field, idx) => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label>${field.label} <small>(${field.unit})</small></label>
            <input type="text" class="gen-input" data-label="${field.label}" data-unit="${field.unit}" id="field-input-${idx}">
        `;
        inputArea.appendChild(div);
    });

    renderEntryList();
    highlightNav(`nav-cat-${cat.id}`);
}

// --- API Suche Logik ---
async function runApiSearch() {
    const query = document.getElementById('api-search-input').value;
    if(!query) return;
    
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`);
        const data = await res.json();
        
        if(data.products && data.products.length > 0) {
            const p = data.products[0];
            const kcal = p.nutriments['energy-kcal_100g'] || 0;
            const name = p.product_name;

            // Fülle die Felder automatisch!
            // Wir suchen Inputs anhand ihres Labels (Case Insensitive)
            fillInputByLabel('Produkt', name);
            fillInputByLabel('Kalorien', kcal);
            
            // Fokus auf Menge setzen für schnelle Eingabe
            const amountField = findInputByLabel('Menge');
            if(amountField) amountField.focus();

        } else {
            document.getElementById('api-error').innerText = "Nichts gefunden.";
        }
    } catch(e) {
        console.error(e);
        document.getElementById('api-error').innerText = "API Fehler.";
    }
}

function fillInputByLabel(partOfLabel, value) {
    const inputs = document.querySelectorAll('.gen-input');
    inputs.forEach(input => {
        const lbl = input.getAttribute('data-label').toLowerCase();
        if(lbl.includes(partOfLabel.toLowerCase())) {
            input.value = value;
        }
    });
}
function findInputByLabel(partOfLabel) {
    return Array.from(document.querySelectorAll('.gen-input')).find(i => i.getAttribute('data-label').toLowerCase().includes(partOfLabel.toLowerCase()));
}

// --- Speichern ---
async function addGenericEntry() {
    if(!currentCategory) return;
    
    const inputs = document.querySelectorAll('.gen-input');
    const details = {};
    let mainVal = 0;
    let summary = "";
    let hasVal = false;

    inputs.forEach(input => {
        const val = input.value;
        const label = input.getAttribute('data-label');
        const unit = input.getAttribute('data-unit');
        
        if(val) {
            details[label] = val + " " + unit;
            summary += `${label}: ${val} | `;
            
            // Intelligente "Wert"-Erkennung für Charts
            // Wenn Einheit 'kcal' enthält, nimm das als Hauptwert
            if(unit.toLowerCase().includes('kcal')) {
                mainVal = parseFloat(val);
                hasVal = true;
            }
        }
    });

    if(!hasVal && inputs.length > 0 && inputs[0].value) {
        // Fallback: Nimm den ersten numerischen Wert, falls keine Kcal gefunden wurden
         const num = parseFloat(inputs[0].value);
         if(!isNaN(num)) mainVal = num;
    }

    const newEntry = {
        user: currentUser,
        type: 'cat_' + currentCategory.id,
        text: currentCategory.name,
        val: mainVal,
        details: details,
        timestamp: Date.now()
    };

    await fetch('/api/entries', {
        method:'POST', 
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(newEntry)
    });
    
    loadData(); // Reload
}

// --- Create Category Logik ---
function initCreateView() {
    document.getElementById('new-cat-name').value = '';
    document.getElementById('field-list-container').innerHTML = '';
    addFieldRow(); // Ein Feld min.
}

function addFieldRow() {
    const div = document.createElement('div');
    div.className = 'field-row';
    div.style.marginBottom = '10px';
    div.innerHTML = `<input class="f-lbl" placeholder="Feldname" style="width:45%;display:inline"> <input class="f-unit" placeholder="Einheit" style="width:45%;display:inline">`;
    document.getElementById('field-list-container').appendChild(div);
}

async function createCategory() {
    const name = document.getElementById('new-cat-name').value;
    const rows = document.querySelectorAll('.field-row');
    const fields = [];
    rows.forEach(r => {
        const l = r.querySelector('.f-lbl').value;
        const u = r.querySelector('.f-unit').value;
        if(l) fields.push({label:l, unit:u});
    });

    if(!name || fields.length===0) return alert("Fehlt was!");

    await fetch('/api/categories', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({user:currentUser, name:name, fields:fields})
    });
    loadData();
}

// --- Standard Helpers ---
function switchTab(id) {
    document.querySelectorAll('.view-section').forEach(e => e.classList.add('hidden'));
    document.getElementById('view-' + id).classList.remove('hidden');
    if(id === 'create-category') initCreateView();
    if(id === 'reporting') updateChart();
}

function highlightNav(id) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    const el = document.getElementById(id);
    if(el) el.classList.add('active');
}

function renderEntryList() {
    const list = document.getElementById('list-generic');
    // Filtere Einträge für aktuelle Kategorie
    const myEntries = entries.filter(e => e.type === 'cat_' + currentCategory.id);
    
    list.innerHTML = myEntries.map(e => {
        let det = "";
        for(let k in e.details) det += `<div><b>${k}:</b> ${e.details[k]}</div>`;
        return `<tr><td>${det}</td><td>${new Date(e.timestamp).toLocaleTimeString()}</td><td><button onclick="del(${e.id})" style="color:red">X</button></td></tr>`;
    }).join('');
}

async function del(id) {
    await fetch('/api/entries/' + id, {method:'DELETE'});
    loadData();
}

function logout() { location.reload(); }
async function resetApp() { 
    if(confirm("Alles löschen?")) {
        await fetch('/api/reset', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:currentUser})});
        location.reload(); 
    }
}

// --- Chart (Simpel: Balance) ---
let myChart;
function updateChart() {
    const ctx = document.getElementById('chart-balance');
    
    // Summiere Values pro Kategorie-Typ
    const sums = {};
    entries.forEach(e => {
        if(!sums[e.text]) sums[e.text] = 0;
        sums[e.text] += e.val;
    });

    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(sums),
            datasets: [{
                label: 'Summe (Kcal/Min/Score)',
                data: Object.values(sums),
                backgroundColor: ['#3b82f6', '#22c55e', '#a855f7', '#eab308']
            }]
        }
    });
}