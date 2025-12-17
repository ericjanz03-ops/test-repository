///////////////
//Login logic//
///////////////
const LOGIN_KEY = 'healthtracker_is_logged_in';
const LOGIN_KEY_USER = 'healthtracker_username';
const STORAGE_KEY = 'healthtracker_clean_final';

let entries = [];
let currentUser = null; // Speichert den Namen des aktuellen Users

// Temp Variablen
let tempFood = null;
let selectedMoodScore = null;
let selectedMoodIcon = null;


document.addEventListener('DOMContentLoaded', () => {
    // A. Prüfen: Ist jemand eingeloggt?
    const isLoggedIn = localStorage.getItem(LOGIN_KEY) === 'true';
    
    if (isLoggedIn) {
        // JA: App anzeigen
        currentUser = localStorage.getItem(LOGIN_KEY_USER);
        showMainApp();
        console.info('blabla');
    } else {
        // NEIN: Login anzeigen
        showLoginScreen();
    }
    
    // B. Daten laden
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) entries = JSON.parse(storedData);
});

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    document.getElementById('display-username').innerText = currentUser;
    switchTab('fitness');
    console.info("show main app executed successfully");
}

function handleLogin() {
    console.log("Button wurde geklickt!");
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    //unsername and password hardcoded for first tests
    const VALID_USERNAME = 'test';
    const VALID_PASSWORD = '1234';

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        localStorage.setItem(LOGIN_KEY, 'true');
        localStorage.setItem(LOGIN_KEY_USER, username);
        currentUser = username;
        showMainApp();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

function logout() {
    if (confirm("Möchtest du dich wirklich abmelden?")) {
        localStorage.removeItem(LOGIN_KEY);
        localStorage.removeItem(LOGIN_KEY_USER);
        currentUser = localStorage.getItem(LOGIN_KEY_USER);
        //delete all data when logging out
        localStorage.removeItem(STORAGE_KEY); 
        showLoginScreen();
    }
}

/* =========================================
   3. HELFER (Speichern & Löschen)
   ========================================= */
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    renderLists();
}

function del(id) {
    entries = entries.filter(e => e.id !== id);
    save();
    updateCharts();
}

function resetApp() {
    if (confirm("Wirklich alle Daten löschen?")) {
        // Wir löschen nur die Daten, NICHT den Login!
        localStorage.removeItem(STORAGE_KEY);
        entries = [];
        renderLists();
        updateCharts();
        alert("Daten gelöscht.");
    }
}

//////////////
//navigation//
//////////////
function switchTab(tabId) {
    //hide all tabs
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    //show tab
    const targetView = document.getElementById('view-' + tabId);
    if (targetView) targetView.classList.remove('hidden');

    // reset sidebar buttons
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'active-fitness', 'active-nutrition', 'active-mood', 'active-reporting');
    })

    //mark active button
    const activeBtn = document.getElementById('nav-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.add('active-' + tabId);
    }

    //when reporting is selected, the charts should be updated automatically
    if (tabId === 'reporting') updateCharts();
    renderLists();
}

/////////////////////
//logic fitness tab//
/////////////////////
function addWorkout() {
    //read input field values
    const activityInput = document.getElementById('fit-activity');
    const durationInput = document.getElementById('fit-duration');

    if (!activityInput.value || !durationInput.value) {
        alert("Bitte ausfüllen");
        return;
    }

    ///////////////////////
    //hier speicher logic//
    ///////////////////////
}

///////////////////////
//logic Ernährung tab//
///////////////////////
async function searchFood() {
    const query = document.getElementById('nut-search').value.trim();
    if (!query) return;

    try {
        // api call OpenFoodFacts
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`);
        const data = await res.json(); // read answer form json

        if (data.products && data.products.length > 0) {
            const p = data.products[0];
            //get calories or 0 if none found
            let kcal = p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'] || 0;
            
            //safe product temporarly
            tempFood = { 
                name: p.product_name, 
                kcalPer100: Math.round(kcal), 
                img: p.image_front_small_url || '' 
            };

            //show preview
            document.getElementById('nut-weight').value = 100;
            document.getElementById('nut-name').innerText = tempFood.name;
            document.getElementById('nut-base-kcal').innerText = tempFood.kcalPer100;
            document.getElementById('nut-img').src = tempFood.img;
            document.getElementById('nut-preview').classList.remove('hidden');
            
            //updateCalculatedKcal(); //inital calculation
        }
    } catch(e) {
        console.error(e);
        alert("Fehler bei der Suche!");
    }
}

//calculating calories
function updateCalculatedKcal() {
    if (!tempFood) return;
    const weight = parseInt(document.getElementById('nut-weight').value) || 0;
    const totalcalories = Math.round((weight/100) * tempFood.kcalPer100);
    document.getElementById('nut-total-calories').innerText = totalcalories;
}

    //hier speicherlogic für Kalorien
function addNutrition() {
    if(!tempFood) return;
    
    const weight = parseInt(document.getElementById('nut-weight').value) || 0;
    const totalKcal = parseInt(document.getElementById('nut-total-calories').innerText) || 0;

    const newEntry = {
        id: Date.now(),
        type: 'nutrition',
        text: tempFood.name + ` (${weight}g)`,
        val: totalKcal,
        timestamp: Date.now()
    };

    entries.push(newEntry);
    save();

    document.getElementById('nut-preview').classList.add('hidden');
    document.getElementById('nut-search').value = '';
    tempFood = null;

}

//////////////////////
//mood tracker logic//
//////////////////////
function selectMood(score, icon, btnElement) {
    selectedMoodScore = score;
    selectedMoodIcon = icon;

    //remove css classes
    document.querySelectorAll('.mood-btn').forEach(button => {
        button.classList.remove('selected')
        button.style.opacity = '0.5'
    });

    //make selected button look selected
    btnElement.classList.add('selected');
    btnElement.style.opacity = '1';
}

    //hier speicherung der Mood einbauen
function saveMood() {
    if(!selectedMoodScore) {
        alert("Bitte erst eine Stimmung wählen!");
        return;
    }
    
    const note = document.getElementById('mood-note').value;

    const newEntry = {
        id: Date.now(),
        type: 'mood',
        text: 'Stimmung',
        score: selectedMoodScore,
        icon: selectedMoodIcon,
        note: note,
        val: 0, // Mood hat keine Kalorien
        timestamp: Date.now()
    };

    entries.push(newEntry);
    save();

    // Reset
    document.getElementById('mood-note').value = '';
    selectedMoodScore = null;
    document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.remove('selected');
        b.style.opacity = '0.5';
    });
}




///////////////
//render HTML//
///////////////
function renderLists() {
    // Wir bauen HTML Strings und fügen sie in die Tabelle ein
    
    // A. Fitness Liste
    const fitnessEntries = entries.filter(e => e.type === 'fitness');
    document.getElementById('list-fitness').innerHTML = fitnessEntries.map(e => `
        <tr>
            <td>${e.text}<br><small style="color:#999">${new Date(e.timestamp).toLocaleTimeString()}</small></td>
            <td style="font-weight:bold; color:var(--col-fitness)">-${e.val} kcal</td>
            <td><button onclick="del(${e.id})" class="btn-small btn-red">X</button></td>
        </tr>
    `).join(''); // .join('') macht aus dem Array einen einzigen langen String

    // B. Nutrition Liste
    const nutEntries = entries.filter(e => e.type === 'nutrition');
    document.getElementById('list-nutrition').innerHTML = nutEntries.map(e => `
        <tr>
            <td>${e.text}<br><small style="color:#999">${new Date(e.timestamp).toLocaleTimeString()}</small></td>
            <td style="font-weight:bold; color:var(--col-nutrition)">+${e.val} kcal</td>
            <td><button onclick="del(${e.id})" class="btn-small btn-red">X</button></td>
        </tr>
    `).join('');
    
    // C. Mood Liste (Cards)
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
    // Durch alle Einträge loopen und summieren
    entries.forEach(x => {
        if(x.type==='fitness') b+=x.val;
        if(x.type==='nutrition') e+=x.val;
        if(x.type==='mood') { ms+=x.score; mc++; }
    });
    
    document.getElementById('rep-burned').innerText = b + ' kcal';
    document.getElementById('rep-eaten').innerText = e + ' kcal';
    document.getElementById('rep-mood').innerText = mc ? (ms/mc).toFixed(1) : '-';
}


////////////////
//charts bauen//
////////////////
let ch1, ch2; // Variablen zum Speichern der Diagramm-Instanzen

function updateCharts() {
    // Nur zeichnen, wenn Reporting sichtbar ist
    if(document.getElementById('view-reporting').classList.contains('hidden')) return;
    
    // Daten chronologisch sortieren (Alt -> Neu)
    const data = [...entries].sort((a,b) => a.timestamp - b.timestamp);
    
    // 1. Mood Chart
    if(ch1) ch1.destroy(); // Alten Chart löschen
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