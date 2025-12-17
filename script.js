// Globale Variablen
let entries = [];
let currentUser = null; 

// Temp Variablen
let tempFood = null;
let selectedMoodScore = null;
let selectedMoodIcon = null;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    // Prüfen ob User im "Session Storage" ist (nur für Browser-Session merken)
    const savedUser = sessionStorage.getItem('healthtracker_user');
    
    if (savedUser) {
        currentUser = savedUser;
        showMainApp();
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
}

async function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('display-username').innerText = currentUser;
    
    // WICHTIG: Daten vom Server laden statt localStorage
    await loadDataFromServer();
    
    switchTab('fitness');
}

// --- API Helper Funktionen ---

async function loadDataFromServer() {
    try {
        const res = await fetch(`/api/entries?user=${currentUser}`);
        entries = await res.json();
        renderLists();
        updateCharts();
    } catch (e) {
        console.error("Fehler beim Laden:", e);
    }
}

async function sendEntryToServer(entry) {
    try {
        // Wir fügen den Usernamen hinzu, damit das Backend weiß, wem es gehört
        entry.user = currentUser;
        
        const res = await fetch('/api/entries', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(entry)
        });
        const savedEntry = await res.json();
        
        // Füge den vom Server bestätigten Eintrag (mit echter DB-ID) zur lokalen Liste hinzu
        entries.push(savedEntry);
        renderLists();
        updateCharts();
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
    }
}

async function deleteEntryFromServer(id) {
    try {
        await fetch(`/api/entries/${id}`, { method: 'DELETE' });
        entries = entries.filter(e => e.id !== id);
        renderLists();
        updateCharts();
    } catch (e) {
        console.error("Fehler beim Löschen:", e);
    }
}

// --- Login Logik ---

async function handleLogin() {
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (data.success) {
            currentUser = data.username;
            sessionStorage.setItem('healthtracker_user', currentUser);
            showMainApp();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
        }
    } catch (e) {
        alert("Login Server Fehler");
    }
}

function logout() {
    if (confirm("Möchtest du dich wirklich abmelden?")) {
        sessionStorage.removeItem('healthtracker_user');
        currentUser = null;
        entries = [];
        showLoginScreen();
    }
}

// --- Reset ---

async function resetApp() {
    if (confirm("Wirklich alle Daten löschen?")) {
        await fetch('/api/reset', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user: currentUser })
        });
        entries = [];
        renderLists();
        updateCharts();
    }
}

// --- Navigation & Charts (bleiben gleich, rufen nur renderLists auf) ---
function switchTab(tabId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const targetView = document.getElementById('view-' + tabId);
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'active-fitness', 'active-nutrition', 'active-mood', 'active-reporting');
    })

    const activeBtn = document.getElementById('nav-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.add('active-' + tabId);
    }

    if (tabId === 'reporting') updateCharts();
    renderLists();
}

// --- Fitness Logic (NEU mit Speicherlogik) ---
function addWorkout() {
    const activityInput = document.getElementById('fit-activity');
    const durationInput = document.getElementById('fit-duration');

    if (!activityInput.value || !durationInput.value) {
        alert("Bitte ausfüllen");
        return;
    }

    // Einfache Kalorienberechnung (z.B. 5 kcal pro Minute)
    const duration = parseInt(durationInput.value);
    const estimatedKcal = duration * 7; 

    const newEntry = {
        type: 'fitness',
        text: `${activityInput.value} (${duration} min)`,
        val: estimatedKcal,
        timestamp: Date.now()
    };

    // An Server senden
    sendEntryToServer(newEntry);

    // Reset Inputs
    activityInput.value = '';
    durationInput.value = '';
}

// --- Nutrition Logic ---
async function searchFood() {
    // (Bleibt gleich wie in deinem Code)
    const query = document.getElementById('nut-search').value.trim();
    if (!query) return;

    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`);
        const data = await res.json();

        if (data.products && data.products.length > 0) {
            const p = data.products[0];
            let kcal = p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'] || 0;
            
            tempFood = { 
                name: p.product_name, 
                kcalPer100: Math.round(kcal), 
                img: p.image_front_small_url || '' 
            };

            document.getElementById('nut-weight').value = 100;
            document.getElementById('nut-name').innerText = tempFood.name;
            document.getElementById('nut-base-kcal').innerText = tempFood.kcalPer100;
            document.getElementById('nut-img').src = tempFood.img;
            document.getElementById('nut-preview').classList.remove('hidden');
            updateCalculatedKcal();
        }
    } catch(e) {
        console.error(e);
        alert("Fehler bei der Suche!");
    }
}

function updateCalculatedKcal() {
    if (!tempFood) return;
    const weight = parseInt(document.getElementById('nut-weight').value) || 0;
    const totalcalories = Math.round((weight/100) * tempFood.kcalPer100);
    document.getElementById('nut-total-calories').innerText = totalcalories;
}

function addNutrition() {
    if(!tempFood) return;
    
    const weight = parseInt(document.getElementById('nut-weight').value) || 0;
    const totalKcal = parseInt(document.getElementById('nut-total-calories').innerText) || 0;

    const newEntry = {
        type: 'nutrition',
        text: tempFood.name + ` (${weight}g)`,
        val: totalKcal,
        timestamp: Date.now()
    };

    sendEntryToServer(newEntry);

    document.getElementById('nut-preview').classList.add('hidden');
    document.getElementById('nut-search').value = '';
    tempFood = null;
}

// --- Mood Tracker Logic ---
function selectMood(score, icon, btnElement) {
    selectedMoodScore = score;
    selectedMoodIcon = icon;
    document.querySelectorAll('.mood-btn').forEach(button => {
        button.classList.remove('selected')
        button.style.opacity = '0.5'
    });
    btnElement.classList.add('selected');
    btnElement.style.opacity = '1';
}

function saveMood() {
    if(!selectedMoodScore) {
        alert("Bitte erst eine Stimmung wählen!");
        return;
    }
    
    const note = document.getElementById('mood-note').value;

    const newEntry = {
        type: 'mood',
        text: 'Stimmung',
        score: selectedMoodScore,
        icon: selectedMoodIcon,
        note: note,
        val: 0,
        timestamp: Date.now()
    };

    sendEntryToServer(newEntry);

    // Reset
    document.getElementById('mood-note').value = '';
    selectedMoodScore = null;
    document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.remove('selected');
        b.style.opacity = '0.5';
    });
}

// --- Render Logic (Löschen angepasst) ---
function del(id) {
    // Hier rufen wir nun die Server-Löschung auf
    deleteEntryFromServer(id);
}

function renderLists() {
    // A. Fitness Liste
    const fitnessEntries = entries.filter(e => e.type === 'fitness');
    document.getElementById('list-fitness').innerHTML = fitnessEntries.map(e => `
        <tr>
            <td>${e.text}<br><small style="color:#999">${new Date(e.timestamp).toLocaleTimeString()}</small></td>
            <td style="font-weight:bold; color:var(--col-fitness)">-${e.val} kcal</td>
            <td><button onclick="del(${e.id})" class="btn-small btn-red">X</button></td>
        </tr>
    `).join('');

    // B. Nutrition Liste
    const nutEntries = entries.filter(e => e.type === 'nutrition');
    document.getElementById('list-nutrition').innerHTML = nutEntries.map(e => `
        <tr>
            <td>${e.text}<br><small style="color:#999">${new Date(e.timestamp).toLocaleTimeString()}</small></td>
            <td style="font-weight:bold; color:var(--col-nutrition)">+${e.val} kcal</td>
            <td><button onclick="del(${e.id})" class="btn-small btn-red">X</button></td>
        </tr>
    `).join('');
    
    // C. Mood Liste
    const moodEntries = entries.filter(e => e.type === 'mood');
    document.getElementById('list-mood').innerHTML = moodEntries.map(e => `
        <div style="border-bottom:1px solid #eee; padding:10px 0; display:flex; gap:10px;">
            <div style="font-size:2rem">${e.icon}</div>
            <div>
                <b>${e.text}</b> <small>${new Date(e.timestamp).toLocaleDateString()}</small>
                <p style="margin:5px 0; color:#555"><i>${e.note || ''}</i></p>
                <button onclick="del(${e.id})" style="color:red; background:none; border:none; cursor:pointer;">Löschen</button>
            </div>
        </div>
    `).join('');
        
    updateStats();
}

function updateStats() {
    let b=0, e=0, ms=0, mc=0;
    entries.forEach(x => {
        if(x.type==='fitness') b+=x.val;
        if(x.type==='nutrition') e+=x.val;
        if(x.type==='mood') { ms+=x.score; mc++; }
    });
    
    document.getElementById('rep-burned').innerText = b + ' kcal';
    document.getElementById('rep-eaten').innerText = e + ' kcal';
    document.getElementById('rep-mood').innerText = mc ? (ms/mc).toFixed(1) : '-';
}

let ch1, ch2; 

function updateCharts() {
    if(document.getElementById('view-reporting').classList.contains('hidden')) return;
    
    // Daten sortieren
    const data = [...entries].sort((a,b) => a.timestamp - b.timestamp);
    
    // 1. Mood Chart
    if(ch1) ch1.destroy();
    ch1 = new Chart(document.getElementById('chartMood'), {
        type: 'line',
        data: {
            labels: data.filter(x=>x.type==='mood').map(x => new Date(x.timestamp).toLocaleDateString()),
            datasets: [{ 
                label: 'Stimmung', 
                data: data.filter(x=>x.type==='mood').map(x=>x.score), 
                borderColor: '#a855f7', 
                fill:true 
            }]
        },
        options: { scales: {y:{min:0, max:5}} }
    });

    // 2. Calorie Chart
    let b=0, e=0;
    entries.forEach(x => { if(x.type==='fitness') b+=x.val; if(x.type==='nutrition') e+=x.val; });
    
    if(ch2) ch2.destroy();
    ch2 = new Chart(document.getElementById('chartCal'), {
        type: 'bar',
        data: { 
            labels: ['Verbrannt', 'Aufgenommen'], 
            datasets: [{ 
                label: 'Kcal', 
                data: [b, e], 
                backgroundColor: ['#3b82f6', '#22c55e'] 
            }] 
        }
    });
}