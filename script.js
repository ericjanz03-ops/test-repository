// ==========================================
// Globale Variablen
// ==========================================
let authToken = sessionStorage.getItem('healthtracker_token');
let currentUser = sessionStorage.getItem('healthtracker_user');
let categories = [];
let entries = [];
let currentCategory = null;

// ==========================================
// Initialisierung & Auth
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (authToken && currentUser) {
        showAppScreen();
        loadData();
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
}

function showAppScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('display-username').innerText = "Hallo " + currentUser + "!";
}

// Zentrale Fetch-Funktion (fügt automatisch den Token hinzu)
async function apiFetch(url, options = {}) {
    // Header initialisieren falls nicht vorhanden
    if (!options.headers) options.headers = {};
    
    // JSON Content-Type Standard
    options.headers['Content-Type'] = 'application/json';

    // Token anhängen, wenn vorhanden
    if (authToken) {
        options.headers['Authorization'] = 'Bearer ' + authToken;
    }

    const response = await fetch(url, options);

    // Falls Token abgelaufen (401), ausloggen
    if (response.status === 401) {
        logout();
        return null;
    }

    return response;
}

// ==========================================
// Authentication Logic
// ==========================================

let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');
    
    // Reset Nachrichten
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (isRegisterMode) {
        // Modus: REGISTRIEREN
        document.getElementById('auth-title').innerText = "Neues Konto";
        document.getElementById('auth-subtitle').innerText = "Erstelle deinen Tracker.";
        document.getElementById('email-container').classList.remove('hidden');
        document.getElementById('btn-login').classList.add('hidden');
        document.getElementById('btn-register').classList.remove('hidden');
        document.getElementById('txt-toggle').innerText = "Bereits ein Konto?";
        document.getElementById('link-toggle').innerText = "Anmelden";
    } else {
        // Modus: LOGIN
        document.getElementById('auth-title').innerText = "Willkommen";
        document.getElementById('auth-subtitle').innerText = "Bitte melde dich an.";
        document.getElementById('email-container').classList.add('hidden');
        document.getElementById('btn-login').classList.remove('hidden');
        document.getElementById('btn-register').classList.add('hidden');
        document.getElementById('txt-toggle').innerText = "Noch kein Konto?";
        document.getElementById('link-toggle').innerText = "Jetzt registrieren";
    }
}

async function handleLogin() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const errorEl = document.getElementById('auth-error');

    errorEl.classList.add('hidden');

    if(!u || !p) {
        errorEl.innerText = "Bitte Benutzername und Passwort eingeben.";
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        // 1. Nur Login Endpunkt aufrufen (KEINE automatische Registrierung mehr!)
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p})
        });
        
        const data = await res.json();

        if (data.success) {
            // Token speichern
            authToken = data.token;
            currentUser = data.username;
            sessionStorage.setItem('healthtracker_token', authToken);
            sessionStorage.setItem('healthtracker_user', currentUser);
            
            showAppScreen();
            loadData();
        } else {
            // Fehler anzeigen (z.B. wenn User nicht in DB)
            errorEl.innerText = "Benutzername oder Passwort falsch.";
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        console.error(e);
        errorEl.innerText = "Server nicht erreichbar.";
        errorEl.classList.remove('hidden');
    }
}

async function handleRegister() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const e = document.getElementById('email').value;
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if(!u || !p || !e) {
        errorEl.innerText = "Bitte alle Felder ausfüllen.";
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p, email: e})
        });
        
        const data = await res.json();

        if (data.success) {
            successEl.innerText = "Konto erstellt! Du kannst dich jetzt einloggen.";
            successEl.classList.remove('hidden');
            // Formular leeren
            document.getElementById('password').value = '';
            // Zurück zum Login wechseln nach 1 Sekunde
            setTimeout(() => { toggleAuthMode(); }, 1500);
        } else {
            errorEl.innerText = data.error || "Registrierung fehlgeschlagen (Name schon vergeben?).";
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        console.error(err);
        errorEl.innerText = "Ein Fehler ist aufgetreten.";
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    sessionStorage.clear();
    showLoginScreen();
}

async function resetApp() {
    if(confirm("Wirklich alles löschen? Dies kann nicht rückgängig gemacht werden.")) {
        await apiFetch('/api/reset', { method: 'POST', body: JSON.stringify({}) });
        location.reload();
    }
}

// ==========================================
// Daten Laden & Anzeigen
// ==========================================

async function loadData() {
    if (!authToken) return;

    try {
        // Kategorien laden
        const catRes = await apiFetch('/api/categories');
        if(catRes) categories = await catRes.json();

        // Einträge laden
        const entRes = await apiFetch('/api/entries');
        if(entRes) entries = await entRes.json();

        renderSidebar();
        
        // Wenn Kategorien da sind, aber keine ausgewählt, die erste öffnen
        if (!currentCategory && categories.length > 0) {
            openCategory(categories[0]);
        } else if (currentCategory) {
            // Falls wir gerade eine offen hatten (z.B. nach Reload), diese neu rendern
            const stillExists = categories.find(c => c.id === currentCategory.id);
            if(stillExists) openCategory(stillExists);
        }

    } catch (e) {
        console.error("Fehler beim Laden:", e);
    }
}

function renderSidebar() {
    const nav = document.getElementById('nav-container');
    nav.innerHTML = ''; // Leeren

    categories.forEach(cat => {
        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'nav-item';
        btn.id = 'nav-cat-' + cat.id;
        btn.innerText = cat.name;
        
        // Kleines Icon basierend auf Namen (Optional)
        if(cat.name.toLowerCase().includes('fit')) btn.innerText += ' 🏃';
        if(cat.name.toLowerCase().includes('ernährung')) btn.innerText += ' 🍎';
        
        btn.onclick = () => openCategory(cat);
        nav.appendChild(btn);
    });
}

// ==========================================
// Kategorie Logik (Generic View)
// ==========================================

function openCategory(cat) {
    currentCategory = cat;
    switchTab('generic'); // Zeigt die generische Ansicht

    // Titel setzen
    document.getElementById('gen-title').innerText = cat.name;

    // Inputs bauen basierend auf SQL-Feldern
    const container = document.getElementById('gen-inputs-container');
    container.innerHTML = ''; // Reset

    // Spezial-Widget Container leeren (für Nutrition API)
    const widgetContainer = document.getElementById('special-widget-container');
    widgetContainer.innerHTML = '';

    // BONUS: Wenn Kategorie "Ernährung" heißt, Suchleiste einblenden
    if(cat.name.toLowerCase().includes('ernährung')) {
        renderNutritionWidget(widgetContainer);
    }

    // Felder rendern
    if(cat.fields && cat.fields.length > 0) {
        cat.fields.forEach(field => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '15px';
            
            const label = document.createElement('label');
            label.innerHTML = `${field.label} <small style="color:#888">(${field.unit || ''})</small>`;
            label.style.display = 'block';
            label.style.fontWeight = 'bold';
            
            const input = document.createElement('input');
            // Typ bestimmen (Number oder Text)
            input.type = field.data_type === 'number' ? 'number' : 'text';
            input.className = 'gen-input'; // Klasse zum Wiederfinden
            input.dataset.label = field.label; // Label speichern für Zuordnung
            input.placeholder = field.label;
            input.style.width = '100%';
            input.style.padding = '10px';
            input.style.border = '1px solid #ddd';
            input.style.borderRadius = '5px';

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            container.appendChild(wrapper);
        });
    } else {
        container.innerHTML = '<p style="color:#888; font-style:italic;">Keine Felder definiert.</p>';
    }

    renderEntryList();
    
    // Sidebar active setzen
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById('nav-cat-' + cat.id);
    if(activeBtn) activeBtn.classList.add('active');
}

async function addGenericEntry() {
    if (!currentCategory) return;

    const inputs = document.querySelectorAll('.gen-input');
    const details = {};
    let hasContent = false;

    // Alle Inputs auslesen
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            // Wir mappen: Label -> Wert (z.B. "Menge" -> "100")
            // Die Einheit fügt das Backend oder das Frontend beim Anzeigen hinzu
            details[input.dataset.label] = input.value;
            hasContent = true;
        }
    });

    if (!hasContent) {
        alert("Bitte mindestens ein Feld ausfüllen.");
        return;
    }

    const payload = {
        type: 'cat_' + currentCategory.id, // Format für Backend
        timestamp: Date.now(),
        details: details
    };

    try {
        const res = await apiFetch('/api/entries', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res) {
            // Inputs leeren
            inputs.forEach(i => i.value = '');
            // Daten neu laden
            loadData();
        }
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
    }
}

function renderEntryList() {
    const tbody = document.getElementById('list-generic');
    
    // Filtern nach aktueller Kategorie
    const typeKey = 'cat_' + currentCategory.id;
    const filteredEntries = entries.filter(e => e.type === typeKey);

    tbody.innerHTML = filteredEntries.map(e => {
        // Details HTML bauen
        // e.details ist jetzt ein Objekt: { "Menge": "100 g", "Kcal": "500 kcal" }
        let detailsHtml = '';
        if (e.details) {
            for (const [key, val] of Object.entries(e.details)) {
                detailsHtml += `<span style="display:inline-block; margin-right:10px; padding:2px 6px; background:#f0f9ff; font-size:0.85rem;">
                    <b>${key}:</b> ${val}
                </span>`;
            }
        }

        const timeStr = new Date(e.timestamp).toLocaleDateString() + ' ' + new Date(e.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        return `
            <tr>
                <td>
                    ${detailsHtml}
                </td>
                <td style="color:#666; font-size:0.8rem;">${timeStr}</td>
                <td>
                    <button onclick="deleteEntry(${e.id})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteEntry(id) {
    if(!confirm("Eintrag löschen?")) return;
    await apiFetch('/api/entries/' + id, { method: 'DELETE' });
    loadData();
}

// ==========================================
// Neue Kategorie erstellen
// ==========================================

function initCreateCategoryView() {
    document.getElementById('new-cat-name').value = '';
    document.getElementById('field-list-container').innerHTML = '';
    addFieldRow(); // Ein leeres Feld standardmäßig hinzufügen
}

function addFieldRow() {
    const container = document.getElementById('field-list-container');
    const div = document.createElement('div');
    div.className = 'field-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    
    // HTML für eine Zeile: Label (Text), Typ (Select), Einheit (Text)
    div.innerHTML = `
        <input type="text" class="f-label" placeholder="Feldname (z.B. Gewicht)"; padding:10px;">
        <select class="f-type" style="flex:1; padding:10px;">
            <option value="number">Zahl</option>
            <option value="text">Text</option>
        </select>
        <input type="text" class="f-unit" placeholder="Einheit (z.B. kg)"; padding:10px;">
        <button onclick="this.parentElement.remove()" style="background:#fcc; border:none; border-radius:4px; cursor:pointer; padding:0 10px;">X</button>
    `;
    container.appendChild(div);
}

async function createCategory() {
    const name = document.getElementById('new-cat-name').value;
    if (!name) return alert("Bitte einen Namen eingeben.");

    const rows = document.querySelectorAll('.field-row');
    const fields = [];

    rows.forEach(row => {
        const label = row.querySelector('.f-label').value.trim();
        const type = row.querySelector('.f-type').value;
        const unit = row.querySelector('.f-unit').value.trim();

        if (label) {
            fields.push({
                label: label,
                data_type: type,
                unit: unit
            });
        }
    });

    if (fields.length === 0) return alert("Bitte mindestens ein Feld definieren.");

    const payload = {
        name: name,
        desc: "Benutzerdefinierte Kategorie",
        fields: fields
    };

    try {
        const res = await apiFetch('/api/categories', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res) {
            // Ansicht zurücksetzen und Daten laden
            await loadData();
            // Die neue Kategorie finden (die letzte in der Liste) und öffnen
            if (categories.length > 0) {
                openCategory(categories[categories.length - 1]);
            }
        }
    } catch (e) {
        console.error(e);
        alert("Fehler beim Erstellen.");
    }
}

// ==========================================
// Navigation & Views
// ==========================================

function switchTab(tabId) {
    // Alle Views verstecken
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    // Gewünschte View anzeigen
    const target = document.getElementById('view-' + tabId);
    if (target) target.classList.remove('hidden');

    // Sidebar Reset
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Spezial-Initialisierung
    if (tabId === 'create-category') {
        initCreateCategoryView();
        const btn = document.querySelector('button[onclick="switchTab(\'create-category\')"]');
        if(btn) btn.classList.add('active'); // Style für den Button
        currentCategory = null; // Auswahl aufheben
    }
    
    if (tabId === 'reporting') {
        renderReporting();
        document.getElementById('nav-reporting').classList.add('active');
        currentCategory = null;
    }
}

// ==========================================
// Extras: Nutrition API Widget
// ==========================================
function renderNutritionWidget(container) {
    container.innerHTML = `
        <div style="background:#e6fffa; padding:15px; border-radius:8px; border:1px solid #bbf7d0; margin-bottom:20px;">
            <h4 style="margin-top:0; color:#166534;">Produktsuche (OpenFoodFacts)</h4>
            <div style="display:flex; gap:10px;">
                <input id="api-search-input" type="text" placeholder="z.B. Apfel, Cola..." style="flex:1; padding:8px;">
                <button onclick="runApiSearch()" class="btn-green" style="width:auto;">Suchen</button>
            </div>
            <p id="api-msg" style="margin:5px 0 0 0; font-size:0.9rem; color:#666; min-height:1.2em;"></p>
        </div>
    `;
}

async function runApiSearch() {
    const q = document.getElementById('api-search-input').value;
    const msg = document.getElementById('api-msg');
    if(!q) return;

    msg.innerText = "Suche...";
    
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=1`);
        const data = await res.json();

        if(data.products && data.products.length > 0) {
            const p = data.products[0];
            msg.innerText = `Gefunden: ${p.product_name}`;
            
            // Auto-Fill Versuch: Wir suchen Inputs mit passenden Namen
            const inputs = document.querySelectorAll('.gen-input');
            inputs.forEach(input => {
                const lbl = input.dataset.label.toLowerCase();
                
                // Kalorien
                if(lbl.includes('kalorien') || lbl.includes('kcal') || lbl.includes('energie')) {
                    const k = p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'];
                    if(k) input.value = k;
                }
                
                // Produktname
                if(lbl.includes('produkt') || lbl.includes('name') || lbl.includes('essen')) {
                    input.value = p.product_name;
                }
            });
            
        } else {
            msg.innerText = "Nichts gefunden.";
        }
    } catch(e) {
        console.error(e);
        msg.innerText = "Fehler bei der API.";
    }
}

// ==========================================
// Reporting (Einfacher Placeholder)
// ==========================================
let myChart;
function renderReporting() {
    const ctx = document.getElementById('chart-balance');
    if(!ctx) return;
    
    // Daten aggregieren: Anzahl Einträge pro Kategorie
    const counts = {};
    entries.forEach(e => {
        counts[e.text] = (counts[e.text] || 0) + 1;
    });

    if(myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                label: 'Anzahl Einträge',
                data: Object.values(counts),
                backgroundColor: '#3b82f6'
            }]
        },
        options: { responsive: true }
    });
}